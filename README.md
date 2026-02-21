# Retransify Local (React 2 Native CLI)

### 🚀 Transform React Web Projects into Native Mobile Apps with AI

![License](https://img.shields.io/badge/license-ISC-blue.svg) ![Node](https://img.shields.io/badge/node-v18%2B-green.svg) ![Platform](https://img.shields.io/badge/platform-React%20Native%20%7C%20Expo-blueviolet.svg)

## 📋 Table of Contents

- [📖 Overview](#-overview)
- [🚀 Why Retransify?](#-why-retransify)
- [✨ Key Features](#-key-features)
- [🔒 Privacy & Security](#-privacy--security)
- [🏗️ Architecture](#-architecture)
- [🛠️ Tech Stack](#-tech-stack)
- [🏁 Getting Started](#-getting-started)
- [📱 Usage](#-usage)
- [📂 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 📖 Overview

**Retransify Local** is a powerful CLI tool designed to autonomously convert existing React (web) projects into optimized React Native (Expo) applications. By leveraging advanced AI models (Gemini or Groq), it deeply analyzes your codebase, understands component relationships, and rewrites them for mobile, ensuring a smooth migration from web to native.

## 🚀 Why Retransify?

Migrating a codebase from web to mobile is often a tedious, manual process. Retransify solves this by:

- **Saving Time**: Automates the repetitive work of rewriting JSX to React Native primitives.
- **Context-Awareness**: Unlike simple code modders, it understands the _intent_ of your code through full-project analysis.
- **Modern Standards**: Generates clean, TypeScript-ready code compatible with the latest Expo SDKs.

## ✨ Key Features

- **🤖 3-Phase Agentic Workflow**:
  - **Analyzer**: Deeply scans project structure & tech stack.
  - **Planner**: Formulates a dependency-aware migration strategy.
  - **Executor**: Implements changes with state persistence & recovery.
- **🔍 Automated Scanning & AST Parsing**: Precision analysis of your code's abstract syntax tree.
- **🧠 Context-Aware Conversion**: Intelligent prompts based on full project context, not just isolated files.
- **📱 Expo Ready**: Automatically scaffolds a new Expo project with router configuration.
- **⚡ Multiple AI Providers**: Support for Google's **Gemini** (3.0 Flash, 2.5) and **Groq** (Llama 3, Mixtral).
- **🛤️ Smart Pathing**: Automatically restructures `src/` to Expo's `app/` and `components/` best practices.
- **🔄 Auto-Healing & Verification**: Iteratively verifies code for missing dependencies or syntax errors and prompts the AI for auto-correction.
- **🛡️ State Recovery**: Resume interrupted conversions seamlessly with built-in state management.

## 🔒 Privacy & Security

Your code's privacy is paramount. Retransify is designed with security in mind:

- **Local Execution**: The CLI runs entirely on your local machine. No code is stored on our servers.
- **Direct AI connection**: Data is sent directly from your machine to the chosen AI provider (Google or Groq) via their official APIs.
- **API Key Safety**: Your API keys are stored locally in your `.env` file and are never shared or logged.

## 🏗️ Architecture

The tool follows a robust agentic architecture to ensure reliability:

1.  **Analysis Phase**: Scans files, parses AST, and builds a dependency graph.
2.  **Planning Phase**: prioritizes files based on dependencies (e.g., utils -> lower-level components -> screens).
3.  **Execution Phase**: Iterates through the plan, converting files and maintaining state in case of interruptions.

## 🛠️ Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **AI Integration**: [Google Generative AI SDK](https://github.com/google/generative-ai-js), [Groq SDK](https://console.groq.com/docs/libraries/js)
- **Parsing**: [Babel Parser](https://babeljs.io/docs/en/babel-parser) & Traverse
- **File System**: [fs-extra](https://github.com/jprichardson/node-fs-extra)
- **CLI**: [Commander.js](https://github.com/tj/commander.js/)

## 🏁 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- API Key for **Gemini** or **Groq**

### Installation

1.  **Clone the repository**:

    ```bash
    git clone <repository-url>
    cd retransify-local
    npm install
    ```

2.  **Link locally (optional)**:
    ```bash
    npm link
    ```

### Configuration

Create a `.env` file in the root directory:

```env
# Choose your provider: gemini or groq
AI_PROVIDER=gemini

# API Keys
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

## 📱 Usage

The CLI is **interactive**. Run the convert command to start the wizard:

```bash
# Start conversion (Interactive)
node cli.js convert ./path-to-your-react-app
```

**Options:**

- `--sdk <version>`: Target a specific Expo SDK version (e.g., `--sdk 50`).

## 📂 Project Structure

```text
retransify-local/
├── cli.js              # CLI Entry Point
├── package.json        # Project metadata & dependencies
└── src/
    ├── cli/            # Command handling and interactive prompts
    ├── types.js        # Type definitions
    └── core/
        ├── ai/         # AI Client Wrappers (Gemini, Groq)
        ├── commands/   # CLI commands execution logic
        ├── config/     # Configuration management & environment setup
        ├── context/    # Context generation and dependency graphing
        ├── detectors/  # Technology and library detection logic
        ├── helpers/    # Helper utilities (Retry, Logging, etc.)
        ├── parser/     # AST parsing and code analysis
        ├── phases/     # High-level Agentic Workflow (Analyzer, Planner, Executor)
        ├── prompt/     # Prompt definitions and engineering
        ├── scanners/   # File system scanning and filtering
        ├── services/   # Core internal services (DependencyManager, StateManager, ProjectInitializer, etc.)
        └── utils/      # General utilities
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## 📄 License

This project is licensed under the ISC License.
