// #!/usr/bin/env node
// import { Command } from "commander";
// const program = new Command();
// import { scanProject } from "../src/core/fileScanner.js";
// import { parseFile } from "../src/core/astParser.js";
// import { buildDependencyGraph } from "../src/core/graphBuilder.js";
// import inquirer from "inquirer";

// program
//   .name("retransify")
//   .description("Convert React code to React Native using AI")
//   .version("1.0.0");

// program
//   .command("init")
//   .description("Initialize conversion by asking for project path")
//   .action(async () => {
//     const answers = await inquirer.prompt([
//       {
//         type: "input",
//         name: "projectPath",
//         message:
//           "Enter the FULL path of your React project (Press ENTER to use current folder):",
//       },
//     ]);

//     // Use the provided path or default to current directory
//     const usedPath = answers.projectPath?.trim() || process.cwd();

//     console.log(`📁 Using project path: ${usedPath}`);

//     const { files } = await scanProject(usedPath);

//     const parsed = [];
//     for (const file of files) {
//       const result = await parseFile(file.absolutePath);
//       result.relativeToSrc = file.relativeToSrc;
//       parsed.push(result);
//     }

//     const { importsGraph, reverseGraph } = buildDependencyGraph(parsed);

//     // 4) بناء سياق المشروع
//     const projectContext = buildProjectContext({
//       files,
//       parsedFiles,
//       importsGraph,
//       reverseGraph,
//       structure,
//     });
//   });

// program.parse(process.argv);
