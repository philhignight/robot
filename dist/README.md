# Windows Automation System

## Requirements
- Windows OS
- Java 11 or higher
- Node.js 12.18 or higher
- Maven (optional, for easier building)

## Building

### Option 1: With Maven (Recommended)
1. Install Maven if not already installed
2. Run `build.bat`
3. This will create AutomationRobot.jar

### Option 2: Without Maven
1. Download json-20210307.jar from Maven Central
2. Follow instructions in `build-simple.bat`

## Running
1. After building, run `run.bat`
2. Use `help` command to see available commands

## Project Structure
- `src/AutomationRobot.java` - Java automation code
- `automation-cli.js` - Node.js CLI interface
- `pom.xml` - Maven project file
- `flows/` - Automation flow definitions
- `logs/` - Execution logs (created at runtime)
