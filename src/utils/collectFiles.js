import fs from "fs";
import path from "path";


export function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      if (file !== "node_modules") {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (/\.(js|jsx|ts|tsx)$/.test(file)) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}
