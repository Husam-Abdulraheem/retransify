import path from 'path';
import fs from 'fs-extra';
import { getAllFiles } from '../utils/collectFiles.js';
import {sendToGemini} from '../utils/aiClient.js';


export default async function convertProject() {
  try{
    console.log("Converting project...");
    const projectPath = process.cwd();
    const srcPath = path.join(projectPath, "src/tests");

      // Here we can add the conversion logic to React Native
      if (!fs.existsSync(srcPath)) {
      console.error("❌src folder not found in the project directory.");
      return;
    }

    const files = getAllFiles(srcPath);
    console.log("Found files:", files);

    for (const file of files) {
      const code = await fs.promises.readFile(file, 'utf-8');
      const convertedCode = await sendToGemini(code);
      console.log(`Converted file: ${file}`);
      console.log(convertedCode);
    }
    console.log("Project scan completed!");

  }catch(err){
    console.error(`Error converting project: ${err.message}`);
  }
}