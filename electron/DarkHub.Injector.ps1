$script:CSharpCode = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

namespace DarkHub.Injector
{
    public class NativeInjector
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, int processId);

        [DllImport("kernel32.dll", SetLastError = true, ExactSpelling = true)]
        private static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out UIntPtr lpNumberOfBytesWritten);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateRemoteThread(IntPtr hProcess, IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
        public static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("kernel32", CharSet = CharSet.Ansi, ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr GetProcAddress(IntPtr hModule, string procName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr hObject);

        const uint PROCESS_CREATE_THREAD = 0x0002;
        const uint PROCESS_QUERY_INFORMATION = 0x0400;
        const uint PROCESS_VM_OPERATION = 0x0008;
        const uint PROCESS_VM_WRITE = 0x0020;
        const uint PROCESS_VM_READ = 0x0010;

        const uint MEM_COMMIT = 0x00001000;
        const uint MEM_RESERVE = 0x00002000;
        const uint PAGE_READWRITE = 4;

        public static string Inject(string processName, string dllPath)
        {
            try
            {
                if (!File.Exists(dllPath))
                    return "ERROR: DLL não encontrada no caminho especificado.";

                Process[] processes = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(processName));
                if (processes.Length == 0)
                    return "ERROR: Processo alvo (" + processName + ") não está em execução.";

                Process targetProcess = processes[0];

                IntPtr hProcess = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ, false, targetProcess.Id);

                if (hProcess == IntPtr.Zero)
                    return "ERROR: Falha ao abrir o processo. Execute o DarkHub como Administrador.";

                byte[] dllBytes = Encoding.ASCII.GetBytes(dllPath + "\0");
                IntPtr allocMemAddress = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)dllBytes.Length, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);

                if (allocMemAddress == IntPtr.Zero)
                    return "ERROR: Falha ao alocar memória no processo alvo (VirtualAllocEx).";

                UIntPtr bytesWritten;
                bool writeResult = WriteProcessMemory(hProcess, allocMemAddress, dllBytes, (uint)dllBytes.Length, out bytesWritten);

                if (!writeResult)
                    return "ERROR: Falha ao gravar a DLL na memória alvo (WriteProcessMemory).";

                IntPtr loadLibraryAddr = GetProcAddress(GetModuleHandle("kernel32.dll"), "LoadLibraryA");

                if (loadLibraryAddr == IntPtr.Zero)
                    return "ERROR: Falha ao encontrar o endereço de LoadLibraryA na kernel32.";

                IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, loadLibraryAddr, allocMemAddress, 0, IntPtr.Zero);

                if (hThread == IntPtr.Zero)
                    return "ERROR: Falha ao criar a Thread Remota para execução da DLL (CreateRemoteThread).";

                WaitForSingleObject(hThread, 5000);
                CloseHandle(hThread);
                CloseHandle(hProcess);

                return "SUCCESS: DLL injetada perfeitamente no processo " + processName;
            }
            catch (Exception ex)
            {
                return "CRITICAL ERROR: " + ex.Message;
            }
        }
    }
}
"@

Add-Type -TypeDefinition $CSharpCode -Language CSharp -IgnoreWarnings

$process = $args[0]
$dll = $args[1]

if ([string]::IsNullOrWhiteSpace($process) -or [string]::IsNullOrWhiteSpace($dll)) {
    Write-Output "ERROR: Processo e DLL devem ser informados."
    exit 1
}

$result = [DarkHub.Injector.NativeInjector]::Inject($process, $dll)
Write-Output $result
