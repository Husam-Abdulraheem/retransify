# Retransify Local (React 2 Native CLI)

A powerful CLI tool to convert React (web) projects into optimized React Native (Expo) applications using AI (Gemini or Groq).

## Features

- **3-Phase Agentic Workflow**:
  - **Analyzer**: deeply understands project structure & tech stack.
  - **Planner**: creates a dependency-aware migration strategy.
  - **Executor**: implements changes with state persistence & recovery.
- **Automated Scanning**: Scans your React project structure and files.
- **AST Parsing**: Understands your code's Abstract Syntax Tree (AST) for accurate analysis.
- **Dependency Graph**: Builds a dependency graph to managing imports and component relationships.
- **Context-Aware Conversion**: Generates intelligent prompts for the AI based on the full project context.
- **AI-Powered**: Uses Google's Gemini or Groq to perform the code conversion.
- **Expo Ready**: Automatically creates a new Expo project and writes the converted files into it.

## Getting Started (For Users)

If you are a developer who wants to convert your React application to React Native.

### Installation

1.  Clone this repository or install the package if available (assuming local usage for now).
    ```bash
    git clone <repository-url>
    cd retransify-local
    npm install
    ```

2.  Link the CLI locally (optional, but recommended for easy access):
    ```bash
    npm link
    ```

### Configuration

1.  Create a `.env` file in the root directory.
2.  Add your AI provider keys and configuration:

    ```env
    # Choose your provider: gemini or groq
    AI_PROVIDER=gemini
    
    # API Keys
    GEMINI_API_KEY=your_gemini_api_key
    GROQ_API_KEY=your_groq_api_key
    ```

### Usage

To convert a React project, run the main command. The CLI is now **interactive** and will ask you to select an AI model.

```bash
# General Usage
node cli.js convert <path-to-react-project> [--sdk <version>]

# Examples
# 1. Start conversion (Interactive Model Selection)
node cli.js convert ./my-react-app

# 2. Target specific Expo SDK (e.g., SDK 50)
node cli.js convert ./my-react-app --sdk 50
```

### Supported Models

You can select from the following models during the interactive CLI session:

- **Gemini**:
    - Gemini 3.0 Flash
    - Gemini 2.5 Flash
    - Gemini 2.5 Flash Lite
- **Groq (Llama/Mixtral)**:
    - Llama 3.3 70B (Versatile)
    - Llama 3.1 8B (Instant)
    - Mixtral 8x7b

### New Features (v2.0)
- **Smart Pathing**: Automatically restructures your project (`app/`, `components/`) instead of mirroring `src/`.
- **Expo Router Support**: Configures file-based routing automatically.
- **Strict TypeScript**: Generates `.tsx` files with strict typing interfaces.


The tool will:
1.  Scan and analyze the target React app.
2.  Create a `converted-expo-app` directory (if it doesn't exist).
3.  Convert source files one by one and save them to the new project.

---

## Development (For Contributors)

If you want to contribute to `retransify-local` or modify its core logic.

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd retransify-local
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

### Project Structure

- `cli.js`: Entry point for the CLI.
- `src/cli`: CLI specific logic and command handling.
- `src/core`: Core logic.
    - `phases/`: The heart of the agentic workflow.
        - `analyzer.js`: Scans and detects tech stack.
        - `planner.js`: Creates the execution plan.
        - `executor.js`: Executes the conversion and manages state.
    - `ai/`: AI client implementations (Gemini, Groq) and factory.
    - `prompt/`: Prompt generation logic (`promptBuilder.js`).
    - `helpers/`: Utility helper functions.
    - `fileScanner.js`: Handles file system scanning.
    - `astParser.js`: Parses JS/JSX files into AST.
    - `graphBuilder.js`: Builds dependency graphs.
    - `contextBuilder.js`: Assembles context for the AI.
    - `nativeWriter.js`: Handles file writing to the React Native project.

### Running Locally

To test your changes against a sample React project:

1.  Create a dummy React app or have one ready for testing.
2.  Run the CLI from the source:
    ```bash
    node cli.js convert ../path/to/test-react-app
    ```

### Key Components

- **`src/core/prompt/promptBuilder.js`**: This file contains the logic for constructing the prompt sent to the AI. Modify this if you want to improve how the AI understands the code or change the conversion rules.
- **`src/core/ai/aiFactory.js`**: Handles switching between different AI providers.

### Contributing

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.
