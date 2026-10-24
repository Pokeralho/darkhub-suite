// Starter programs for the Text Editor's code runner, one set per language. Each set teaches the same three ideas
// (output, reading input, loops + functions), so a learner can compare languages side by side.

export type CodeLanguage = 'javascript' | 'python' | 'powershell' | 'c' | 'cpp' | 'csharp' | 'java' | 'go' | 'rust' | 'batch';
export type ExampleId = 'hello' | 'input' | 'loop';

export const LANGUAGE_EXT: Record<CodeLanguage, string[]> = {
  javascript: ['js', 'mjs', 'cjs'], python: ['py'], powershell: ['ps1'], c: ['c'], cpp: ['cpp', 'cc', 'cxx'],
  csharp: ['cs'], java: ['java'], go: ['go'], rust: ['rs'], batch: ['bat', 'cmd']
};

/** Language for a file name, or null for plain text. */
export function languageForFile(name: string): CodeLanguage | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (Object.keys(LANGUAGE_EXT) as CodeLanguage[]).find((l) => LANGUAGE_EXT[l].includes(ext)) ?? null;
}

export const EXAMPLES: Record<CodeLanguage, Record<ExampleId, string>> = {
  javascript: {
    hello: `// Mostra um texto na saída\nconsole.log('Olá, mundo!');\n`,
    input: `// Lê um nome do campo "Entrada" e cumprimenta\nconst nome = require('fs').readFileSync(0, 'utf8').trim() || 'visitante';\nconsole.log(\`Olá, \${nome}!\`);\n`,
    loop: `// Função + laço: tabuada do 7\nfunction tabuada(n) {\n  for (let i = 1; i <= 10; i++) console.log(\`\${n} x \${i} = \${n * i}\`);\n}\ntabuada(7);\n`
  },
  python: {
    hello: `# Mostra um texto na saída\nprint("Olá, mundo!")\n`,
    input: `# Lê um nome do campo "Entrada" e cumprimenta\nnome = input().strip() or "visitante"\nprint(f"Olá, {nome}!")\n`,
    loop: `# Função + laço: tabuada do 7\ndef tabuada(n):\n    for i in range(1, 11):\n        print(f"{n} x {i} = {n * i}")\n\ntabuada(7)\n`
  },
  powershell: {
    hello: `# Mostra um texto na saída\nWrite-Output "Olá, mundo!"\n`,
    input: `# Lê um nome do campo "Entrada" e cumprimenta\n$nome = [Console]::In.ReadLine()\nif (-not $nome) { $nome = "visitante" }\nWrite-Output "Olá, $nome!"\n`,
    loop: `# Função + laço: tabuada do 7\nfunction Tabuada($n) {\n  foreach ($i in 1..10) { Write-Output "$n x $i = $($n * $i)" }\n}\nTabuada 7\n`
  },
  c: {
    hello: `#include <stdio.h>\n\n// Mostra um texto na saída\nint main(void) {\n    printf("Olá, mundo!\\n");\n    return 0;\n}\n`,
    input: `#include <stdio.h>\n\n// Lê dois números do campo "Entrada" e soma\nint main(void) {\n    int a = 0, b = 0;\n    if (scanf("%d %d", &a, &b) != 2) { printf("Digite dois números na Entrada\\n"); return 1; }\n    printf("%d + %d = %d\\n", a, b, a + b);\n    return 0;\n}\n`,
    loop: `#include <stdio.h>\n\n// Função + laço: tabuada do 7\nvoid tabuada(int n) {\n    for (int i = 1; i <= 10; i++) printf("%d x %d = %d\\n", n, i, n * i);\n}\n\nint main(void) {\n    tabuada(7);\n    return 0;\n}\n`
  },
  cpp: {
    hello: `#include <iostream>\n\n// Mostra um texto na saída\nint main() {\n    std::cout << "Olá, mundo!" << std::endl;\n}\n`,
    input: `#include <iostream>\n#include <string>\n\n// Lê um nome do campo "Entrada" e cumprimenta\nint main() {\n    std::string nome;\n    std::getline(std::cin, nome);\n    if (nome.empty()) nome = "visitante";\n    std::cout << "Olá, " << nome << "!" << std::endl;\n}\n`,
    loop: `#include <iostream>\n#include <vector>\n\n// Função + laço: soma de uma lista\nint soma(const std::vector<int>& v) {\n    int total = 0;\n    for (int x : v) total += x;\n    return total;\n}\n\nint main() {\n    std::cout << "Soma: " << soma({3, 5, 8, 13}) << std::endl;\n}\n`
  },
  csharp: {
    hello: `// Mostra um texto na saída (.NET 10: um arquivo .cs roda sozinho)\nConsole.WriteLine("Olá, mundo!");\n`,
    input: `// Lê um nome do campo "Entrada" e cumprimenta\nvar nome = Console.ReadLine();\nif (string.IsNullOrWhiteSpace(nome)) nome = "visitante";\nConsole.WriteLine($"Olá, {nome}!");\n`,
    loop: `// Função + laço: tabuada do 7\nvoid Tabuada(int n)\n{\n    for (var i = 1; i <= 10; i++) Console.WriteLine($"{n} x {i} = {n * i}");\n}\n\nTabuada(7);\n`
  },
  java: {
    hello: `// Mostra um texto na saída\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Olá, mundo!");\n    }\n}\n`,
    input: `import java.util.Scanner;\n\n// Lê um nome do campo "Entrada" e cumprimenta\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        String nome = in.hasNextLine() ? in.nextLine().trim() : "";\n        System.out.println("Olá, " + (nome.isEmpty() ? "visitante" : nome) + "!");\n    }\n}\n`,
    loop: `// Função + laço: tabuada do 7\npublic class Main {\n    static void tabuada(int n) {\n        for (int i = 1; i <= 10; i++) System.out.println(n + " x " + i + " = " + (n * i));\n    }\n\n    public static void main(String[] args) {\n        tabuada(7);\n    }\n}\n`
  },
  go: {
    hello: `package main\n\nimport "fmt"\n\n// Mostra um texto na saída\nfunc main() {\n\tfmt.Println("Olá, mundo!")\n}\n`,
    input: `package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\n// Lê um nome do campo "Entrada" e cumprimenta\nfunc main() {\n\tnome, _ := bufio.NewReader(os.Stdin).ReadString('\\n')\n\tnome = strings.TrimSpace(nome)\n\tif nome == "" {\n\t\tnome = "visitante"\n\t}\n\tfmt.Printf("Olá, %s!\\n", nome)\n}\n`,
    loop: `package main\n\nimport "fmt"\n\n// Função + laço: tabuada do 7\nfunc tabuada(n int) {\n\tfor i := 1; i <= 10; i++ {\n\t\tfmt.Printf("%d x %d = %d\\n", n, i, n*i)\n\t}\n}\n\nfunc main() {\n\ttabuada(7)\n}\n`
  },
  rust: {
    hello: `// Mostra um texto na saída\nfn main() {\n    println!("Olá, mundo!");\n}\n`,
    input: `use std::io::Read;\n\n// Lê um nome do campo "Entrada" e cumprimenta\nfn main() {\n    let mut nome = String::new();\n    std::io::stdin().read_to_string(&mut nome).unwrap();\n    let nome = if nome.trim().is_empty() { "visitante" } else { nome.trim() };\n    println!("Olá, {}!", nome);\n}\n`,
    loop: `// Função + laço: tabuada do 7\nfn tabuada(n: i32) {\n    for i in 1..=10 {\n        println!("{} x {} = {}", n, i, n * i);\n    }\n}\n\nfn main() {\n    tabuada(7);\n}\n`
  },
  batch: {
    hello: `@echo off\nrem Mostra um texto na saída\necho Olá, mundo!\n`,
    input: `@echo off\nrem Lê um nome do campo "Entrada" e cumprimenta\nset /p NOME=\nif "%NOME%"=="" set NOME=visitante\necho Olá, %NOME%!\n`,
    loop: `@echo off\nrem Laço: tabuada do 7\nfor /L %%i in (1,1,10) do (\n  set /a R=7*%%i >nul\n  call echo 7 x %%i = %%R%%\n)\n`
  }
};
