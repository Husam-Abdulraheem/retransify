#!/usr/bin/env node
import { Command } from 'commander';
const program = new Command();
import  convertProject  from '../src/core/convertProject.js';

program
  .name('react2native')
  .description('Convert React code to React Native')
  .version('1.0.0');

program
  .command('convert')
  .description('Convert a React project to React Native')
  .action(convertProject);


program.parse(process.argv);
