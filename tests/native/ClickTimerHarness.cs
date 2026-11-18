// Test entry for the 1 ms timer-period reference count of DarkHub.ClickEngine.cs (tests/clickTimer.test.ts).
// Compiled together with the engine source: csc /main:ClickTimerHarness DarkHub.ClickEngine.cs ClickTimerHarness.cs
// Swaps ClickEngine.timerPeriod for a counting fake, so no winmm call and no input is ever sent.
// Prints one line per scenario: "PASS <name>" or "FAIL <name>: <detail>", then "DONE".
using System;
using System.Collections.Generic;
using System.Threading;
using DarkHub.Native;

public static class ClickTimerHarness
{
    static int begins, ends, beginFails;
    static volatile bool failBegin;
    static readonly List<string> violations = new List<string>();

    static void Reset()
    {
        begins = 0; ends = 0; beginFails = 0; failBegin = false;
        lock (violations) violations.Clear();
        ClickEngine.timerPeriod = new ClickEngine.TimerPeriodRefCount(
            delegate
            {
                if (failBegin) { Interlocked.Increment(ref beginFails); return false; }
                // begin while already raised = unbalanced
                if (Interlocked.Increment(ref begins) - Thread.VolatileRead(ref ends) != 1) Violation("begin while active");
                return true;
            },
            delegate
            {
                if (Thread.VolatileRead(ref begins) - Interlocked.Increment(ref ends) != 0) Violation("end without begin");
            });
    }

    static void Violation(string s) { lock (violations) violations.Add(s); }

    static Thread Start(ThreadStart body)
    {
        var t = new Thread(ClickEngine.RunWithTimer(body)) { IsBackground = true };
        t.Start();
        return t;
    }

    static void Check(bool cond, string what) { if (!cond) throw new Exception(what + " (begins=" + begins + " ends=" + ends + " refs=" + ClickEngine.timerPeriod.Refs + " active=" + ClickEngine.timerPeriod.Active + ")"); }

    static void Scenario(string name, Action body)
    {
        Reset();
        try
        {
            body();
            lock (violations) if (violations.Count > 0) throw new Exception(string.Join("; ", violations.ToArray()));
            Console.WriteLine("PASS " + name);
        }
        catch (Exception e) { Console.WriteLine("FAIL " + name + ": " + e.Message); }
        Console.Out.Flush();
    }

    public static int Main(string[] args)
    {
        Scenario("single worker raises and restores once", delegate
        {
            var go = new ManualResetEvent(false);
            var t = Start(delegate { go.WaitOne(); });
            SpinUntil(delegate { return ClickEngine.timerPeriod.Refs == 1; });
            Check(begins == 1 && ends == 0 && ClickEngine.timerPeriod.Active, "raised while running");
            go.Set(); t.Join();
            Check(begins == 1 && ends == 1 && !ClickEngine.timerPeriod.Active && ClickEngine.timerPeriod.Refs == 0, "restored after exit");
        });

        Scenario("overlapping click / record / playback workers share one period", delegate
        {
            var click = new ManualResetEvent(false); var rec = new ManualResetEvent(false); var play = new ManualResetEvent(false);
            var a = Start(delegate { click.WaitOne(); });
            var b = Start(delegate { rec.WaitOne(); });
            SpinUntil(delegate { return ClickEngine.timerPeriod.Refs == 2; });
            click.Set(); a.Join();                       // click stops while recording continues
            Check(ends == 0 && ClickEngine.timerPeriod.Active, "still raised for the recorder");
            var c = Start(delegate { play.WaitOne(); }); // playback starts before the recorder thread is gone
            SpinUntil(delegate { return ClickEngine.timerPeriod.Refs == 2; });
            rec.Set(); b.Join();
            Check(ends == 0 && ClickEngine.timerPeriod.Active, "still raised for playback");
            play.Set(); c.Join();
            Check(begins == 1 && ends == 1 && ClickEngine.timerPeriod.Refs == 0, "one begin / one end");
        });

        Scenario("worker body throwing still releases", delegate
        {
            var t = new Thread(delegate () { try { ClickEngine.RunWithTimer(delegate { throw new InvalidOperationException("x"); })(); } catch (InvalidOperationException) {} });
            t.Start(); t.Join();
            Check(begins == 1 && ends == 1 && ClickEngine.timerPeriod.Refs == 0, "released after exception");
        });

        Scenario("200 short-lived overlapping workers stay balanced", delegate
        {
            var rnd = new Random(1234);
            var threads = new List<Thread>();
            for (int i = 0; i < 200; i++)
            {
                int ms = rnd.Next(0, 4);
                threads.Add(Start(delegate { Thread.Sleep(ms); }));
                if (i % 7 == 0) Thread.Sleep(1);
            }
            foreach (var t in threads) t.Join();
            Check(begins >= 1 && begins == ends && ClickEngine.timerPeriod.Refs == 0 && !ClickEngine.timerPeriod.Active, "balanced");
        });

        Scenario("Cleanup force-release while workers run; stale releases are ignored", delegate
        {
            var old = new ManualResetEvent(false);
            var a = Start(delegate { old.WaitOne(); });
            var b = Start(delegate { old.WaitOne(); });
            SpinUntil(delegate { return ClickEngine.timerPeriod.Refs == 2; });
            ClickEngine.ForceReleaseTimerPeriod();       // what Cleanup() does for the timer
            Check(begins == 1 && ends == 1 && ClickEngine.timerPeriod.Refs == 0 && !ClickEngine.timerPeriod.Active, "force released");
            var fresh = new ManualResetEvent(false);
            var c = Start(delegate { fresh.WaitOne(); });
            SpinUntil(delegate { return ClickEngine.timerPeriod.Refs == 1; });
            Check(begins == 2 && ClickEngine.timerPeriod.Active, "new worker raised it again");
            old.Set(); a.Join(); b.Join();                // releases from before the force-release
            Check(ends == 1 && ClickEngine.timerPeriod.Refs == 1 && ClickEngine.timerPeriod.Active, "stale releases must not end the new period");
            fresh.Set(); c.Join();
            Check(begins == 2 && ends == 2 && ClickEngine.timerPeriod.Refs == 0, "balanced at the end");
            ClickEngine.ForceReleaseTimerPeriod();       // second Cleanup (ProcessExit after CancelKeyPress) is a no-op
            Check(ends == 2, "double cleanup ends nothing");
        });

        Scenario("timeBeginPeriod failure never calls timeEndPeriod", delegate
        {
            failBegin = true;
            var go = new ManualResetEvent(false);
            var t = Start(delegate { go.WaitOne(); });
            SpinUntil(delegate { return ClickEngine.timerPeriod.Refs == 1; });
            Check(!ClickEngine.timerPeriod.Active && beginFails == 1, "not active after failure");
            go.Set(); t.Join();
            ClickEngine.ForceReleaseTimerPeriod();
            Check(ends == 0 && begins == 0, "no end for a failed begin");
        });

        Console.WriteLine("DONE");
        return 0;
    }

    static void SpinUntil(Func<bool> cond)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (!cond())
        {
            if (sw.ElapsedMilliseconds > 5000) throw new Exception("timeout waiting for workers");
            Thread.Sleep(1);
        }
    }
}
