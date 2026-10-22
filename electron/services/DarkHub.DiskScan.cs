// DarkHub.DiskScan: fast directory crawler for the "Mapa de disco" screen.
// Usage: DarkHub.DiskScan.exe <root folder>
// Streams one record per line (UTF-8, tab separated, times = Unix ms):
//   D <id> <parentId> <name> <mtime> <ctime> <atime> <attributes>      (root has parentId -1)
//   F <parentId> <name> <size> <mtime> <ctime> <atime> <attributes>
//   E <path> <win32 error>                                             (folder that could not be read)
//   DONE <dirs> <files> <errors> <ms>
// FindFirstFileEx(FindExInfoBasic, LARGE_FETCH) returns size and dates during enumeration, so there is no
// per-file stat. Reparse points (junctions, symlinks, OneDrive placeholders' folders) are listed but never
// followed, which avoids loops and counting the same data twice.
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace DarkHub.Native
{
    public static class DiskScan
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode, Pack = 4)]
        private struct WIN32_FIND_DATA
        {
            public uint dwFileAttributes;
            public long ftCreationTime;
            public long ftLastAccessTime;
            public long ftLastWriteTime;
            public uint nFileSizeHigh;
            public uint nFileSizeLow;
            public uint dwReserved0;
            public uint dwReserved1;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string cFileName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)] public string cAlternateFileName;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindFirstFileExW(string lpFileName, int fInfoLevelId, out WIN32_FIND_DATA lpFindFileData, int fSearchOp, IntPtr lpSearchFilter, int dwAdditionalFlags);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool FindNextFileW(IntPtr hFindFile, out WIN32_FIND_DATA lpFindFileData);

        [DllImport("kernel32.dll")]
        private static extern bool FindClose(IntPtr hFindFile);

        private const int FindExInfoBasic = 1;
        private const int FIND_FIRST_EX_LARGE_FETCH = 2;
        private const uint ATTR_DIRECTORY = 0x10;
        private const uint ATTR_REPARSE = 0x400;
        private static readonly IntPtr INVALID = new IntPtr(-1);
        private const long EPOCH_DIFF = 116444736000000000L; // FILETIME of 1970-01-01

        private struct Job { public string Path; public int Id; }

        private static readonly ConcurrentStack<Job> Pending = new ConcurrentStack<Job>();
        private static readonly object OutLock = new object();
        private static Stream _out;
        private static int _nextId;
        private static int _outstanding; // folders pushed and not finished yet; 0 = scan complete
        private static long _dirs, _files, _errors;

        private static long ToMs(long ft) { return ft <= 0 ? 0 : (ft - EPOCH_DIFF) / 10000; }

        private static string Clean(string s) { return s.IndexOf('\t') < 0 && s.IndexOf('\n') < 0 ? s : s.Replace('\t', ' ').Replace('\n', ' '); }

        private static void Flush(StringBuilder sb)
        {
            if (sb.Length == 0) return;
            byte[] bytes = Encoding.UTF8.GetBytes(sb.ToString());
            lock (OutLock) { _out.Write(bytes, 0, bytes.Length); }
            sb.Clear();
        }

        private static string LongPath(string p)
        {
            if (p.StartsWith(@"\\?\")) return p;
            if (p.StartsWith(@"\\")) return @"\\?\UNC\" + p.Substring(2);
            return @"\\?\" + p;
        }

        private static void ScanDir(Job job, StringBuilder sb)
        {
            WIN32_FIND_DATA fd;
            string pattern = LongPath(job.Path.TrimEnd('\\') + @"\*");
            IntPtr h = FindFirstFileExW(pattern, FindExInfoBasic, out fd, 0, IntPtr.Zero, FIND_FIRST_EX_LARGE_FETCH);
            if (h == INVALID)
            {
                int err = Marshal.GetLastWin32Error();
                if (err != 2 && err != 18) { Interlocked.Increment(ref _errors); sb.Append("E\t").Append(Clean(job.Path)).Append('\t').Append(err).Append('\n'); }
                return;
            }
            try
            {
                do
                {
                    string name = fd.cFileName;
                    if (name == "." || name == "..") continue;
                    long m = ToMs(fd.ftLastWriteTime), c = ToMs(fd.ftCreationTime), a = ToMs(fd.ftLastAccessTime);
                    if ((fd.dwFileAttributes & ATTR_DIRECTORY) != 0)
                    {
                        int id = Interlocked.Increment(ref _nextId);
                        Interlocked.Increment(ref _dirs);
                        sb.Append("D\t").Append(id).Append('\t').Append(job.Id).Append('\t').Append(Clean(name)).Append('\t')
                          .Append(m).Append('\t').Append(c).Append('\t').Append(a).Append('\t').Append(fd.dwFileAttributes).Append('\n');
                        if ((fd.dwFileAttributes & ATTR_REPARSE) == 0)
                        {
                            Interlocked.Increment(ref _outstanding);
                            Pending.Push(new Job { Path = job.Path.TrimEnd('\\') + "\\" + name, Id = id });
                        }
                    }
                    else
                    {
                        Interlocked.Increment(ref _files);
                        long size = ((long)fd.nFileSizeHigh << 32) | fd.nFileSizeLow;
                        sb.Append("F\t").Append(job.Id).Append('\t').Append(Clean(name)).Append('\t').Append(size).Append('\t')
                          .Append(m).Append('\t').Append(c).Append('\t').Append(a).Append('\t').Append(fd.dwFileAttributes).Append('\n');
                    }
                    if (sb.Length > 64 * 1024) Flush(sb);
                } while (FindNextFileW(h, out fd));
            }
            finally { FindClose(h); }
        }

        private static void Worker()
        {
            var sb = new StringBuilder(80 * 1024);
            var spin = new SpinWait();
            while (true)
            {
                Job job;
                if (Pending.TryPop(out job))
                {
                    try { ScanDir(job, sb); }
                    catch (Exception ex) { Interlocked.Increment(ref _errors); sb.Append("E\t").Append(Clean(job.Path)).Append("\t0 ").Append(Clean(ex.Message)).Append('\n'); }
                    finally { Interlocked.Decrement(ref _outstanding); }
                    spin.Reset();
                    continue;
                }
                Flush(sb);
                if (Volatile.Read(ref _outstanding) == 0) return;
                spin.SpinOnce();
                if (spin.Count > 20) Thread.Sleep(1);
            }
        }

        public static int Main(string[] args)
        {
            if (args.Length < 1) { Console.Error.WriteLine("usage: DarkHub.DiskScan.exe <folder>"); return 2; }
            string root = Path.GetFullPath(args[0]);
            if (!Directory.Exists(root)) { Console.Error.WriteLine("folder not found: " + root); return 3; }
            _out = new BufferedStream(Console.OpenStandardOutput(), 1 << 20);
            var sw = Stopwatch.StartNew();

            var head = new StringBuilder();
            head.Append("D\t0\t-1\t").Append(Clean(root)).Append("\t0\t0\t0\t16\n");
            Flush(head);
            _outstanding = 1;
            Pending.Push(new Job { Path = root, Id = 0 });

            // Directory listing is I/O bound: a few threads per core keep NVMe queues busy without thrashing HDDs much.
            int n = Math.Max(4, Math.Min(32, Environment.ProcessorCount * 2));
            var threads = new Thread[n];
            for (int i = 0; i < n; i++) { threads[i] = new Thread(Worker) { IsBackground = true }; threads[i].Start(); }
            foreach (var t in threads) t.Join();

            var tail = new StringBuilder();
            tail.Append("DONE\t").Append(_dirs).Append('\t').Append(_files).Append('\t').Append(_errors).Append('\t').Append(sw.ElapsedMilliseconds).Append('\n');
            Flush(tail);
            _out.Flush();
            return 0;
        }
    }
}
