#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

// File paths
const CLICKS_FILE = "clicks.json";
const INPUT_FILE = "input.txt";
const OUTPUT_FILE = "output.txt";
const FLOWS_DIR = "flows";
const LOGS_DIR = "logs";

// Clicks are stored hierarchically under _root:
// {
//   contexts: {
//     _root: {
//       clicks: { "open-chrome": {...} },
//       subcontexts: {
//         chrome: {
//           clicks: { "new-tab": {...} },
//           subcontexts: { ... }
//         }
//       }
//     }
//   }
// }

class AutomationCLI {
  constructor() {
    this.currentContext = [];
    this.clicks = this.loadClicks();
    this.javaProcess = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
    });

    this.initDirs();
    this.startJavaRobot();
  }

  initDirs() {
    if (!fs.existsSync(FLOWS_DIR)) fs.mkdirSync(FLOWS_DIR);
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);
  }

  startJavaRobot() {
    console.log("Starting automation system...");
    console.log("Initializing Java Robot controller...");

    // Clean up any existing files
    if (fs.existsSync(INPUT_FILE)) fs.unlinkSync(INPUT_FILE);
    if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);

    this.javaProcess = spawn(
      "java",
      ["-cp", "json-20210307.jar;.", "AutomationRobot"],
      {
        stdio: "inherit", // This will show Java output
      }
    );

    this.javaProcess.on("error", (err) => {
      console.error("Failed to start Java Robot:", err);
      process.exit(1);
    });

    // Give Java time to start
    setTimeout(() => {
      console.log("System ready!\n");
      this.start();
    }, 2000);
  }

  loadClicks() {
    if (fs.existsSync(CLICKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLICKS_FILE, "utf8"));
      // Migrate old format if needed
      if (data.contexts && !data.contexts._root) {
        const oldContexts = { ...data.contexts };
        data.contexts = {
          _root: {
            clicks: {},
            subcontexts: oldContexts,
          },
        };
        this.saveClicksData(data);
      }
      return data;
    }
    return {
      contexts: {
        _root: {
          clicks: {},
          subcontexts: {},
        },
      },
    };
  }

  saveClicksData(data) {
    fs.writeFileSync(CLICKS_FILE, JSON.stringify(data, null, 2));
  }

  saveClicks() {
    this.saveClicksData(this.clicks);
  }

  getPrompt() {
    return `/${this.currentContext.join("/")}>`;
  }

  getCurrentContextObj() {
    let obj = this.clicks.contexts._root;
    for (const ctx of this.currentContext) {
      if (!obj.subcontexts[ctx]) {
        obj.subcontexts[ctx] = { clicks: {}, subcontexts: {} };
      }
      obj = obj.subcontexts[ctx];
    }
    return obj;
  }

  async sendToRobot(command) {
    console.log("Sending command to robot:", command);
    fs.writeFileSync(INPUT_FILE, JSON.stringify(command));

    // Wait for response
    let attempts = 0;
    while (attempts < 100) {
      // 10 seconds timeout
      if (fs.existsSync(OUTPUT_FILE)) {
        try {
          const content = fs.readFileSync(OUTPUT_FILE, "utf8");
          if (content && content.trim()) {
            fs.unlinkSync(OUTPUT_FILE);
            console.log("Robot response:", content);
            return JSON.parse(content);
          }
        } catch (e) {
          console.error("Error reading robot response:", e);
        }
      }
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    console.error("Robot timeout - no response received");
    console.error("Check if Java process is running and input.txt exists");
    throw new Error("Robot timeout");
  }

  async ask(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  async recordClick(delay = 5) {
    const name = await this.ask("Click name: ");

    // Default to current context
    const currentPath = "/" + this.currentContext.join("/");
    const defaultContext = currentPath === "/" ? "/" : currentPath;

    let targetContext = await this.ask(
      `Target context (Enter="${defaultContext}", "*"=any, or path): `
    );

    // Handle default (empty input means current context)
    if (!targetContext || targetContext.trim() === "") {
      targetContext = defaultContext;
      console.log(`Using default context: ${targetContext}`);
    } else if (targetContext === "*") {
      targetContext = ""; // Empty means no navigation
      console.log("Click will not change context");
    } else if (targetContext === ".") {
      targetContext = defaultContext;
      console.log(`Using current context: ${targetContext}`);
    }

    console.log(`You have ${delay} seconds to position your mouse...`);

    // Show countdown overlay
    for (let i = delay; i > 0; i--) {
      await this.sendToRobot({
        action: "showOverlay",
        text: i.toString(),
        duration: 900, // Show for 900ms
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Show recording message
    await this.sendToRobot({
      action: "showOverlay",
      text: "RECORDING!",
      duration: 0, // Keep showing
    });

    const pos = await this.sendToRobot({ action: "getMousePosition" });

    // Show recorded message
    await this.sendToRobot({
      action: "showOverlay",
      text: `Recorded!\n(${pos.x}, ${pos.y})`,
      duration: 2000, // Show for 2 seconds
    });

    console.log(`Click recorded at (${pos.x}, ${pos.y})`);

    const click = { x: pos.x, y: pos.y };
    if (targetContext !== "") {
      click.targetContext = targetContext;
    }
    // If targetContext is empty string (from "*"), we don't add targetContext property

    // Save to current context
    const contextObj = this.getCurrentContextObj();
    contextObj.clicks[name] = click;

    this.saveClicks();
    console.log(`\nClick '${name}' saved at (${pos.x}, ${pos.y})`);
    if (targetContext === "") {
      console.log(`Target context: none (stays in any context)`);
    } else {
      console.log(`Target context: ${targetContext}`);
    }
    console.log(`Location: ${this.getPrompt()}${name}`);
  }

  listContents() {
    const contextObj = this.getCurrentContextObj();
    const items = [];

    // Add subcontexts
    if (contextObj.subcontexts) {
      Object.keys(contextObj.subcontexts).forEach((ctx) => {
        items.push(ctx + "/");
      });
    }

    // Add clicks
    if (contextObj.clicks) {
      Object.keys(contextObj.clicks).forEach((click) => {
        items.push(click);
      });
    }

    if (items.length === 0) {
      console.log("(empty)");
    } else {
      console.log("Contents:");
      items.forEach((item) => console.log(`  ${item}`));
    }
  }

  changeContext(dir) {
    const prevContext = [...this.currentContext];

    if (dir === "..") {
      if (this.currentContext.length > 0) {
        this.currentContext.pop();
      }
    } else if (dir.startsWith("/")) {
      // Absolute path
      this.currentContext = dir
        .substring(1)
        .split("/")
        .filter((x) => x);
    } else {
      // Relative path
      this.currentContext.push(dir);
    }

    // Verify the context exists
    try {
      let obj = this.clicks.contexts._root;
      for (const ctx of this.currentContext) {
        if (!obj.subcontexts || !obj.subcontexts[ctx]) {
          console.log(`Context '${dir}' not found`);
          this.currentContext = prevContext;
          return;
        }
        obj = obj.subcontexts[ctx];
      }
    } catch (e) {
      console.log(`Invalid context path`);
      this.currentContext = prevContext;
      return;
    }

    this.rl.setPrompt(this.getPrompt());
  }

  makeContext(name) {
    const contextObj = this.getCurrentContextObj();

    if (!contextObj.subcontexts[name]) {
      contextObj.subcontexts[name] = {
        clicks: {},
        subcontexts: {},
      };
    }

    this.saveClicks();
    console.log(`Context '${name}' created`);
    console.log(
      `Tip: Use 'cd ${name}' to enter this context, then 'record' to add clicks`
    );
  }

  async executeFlow(flowName) {
    const flowPath = path.join(FLOWS_DIR, `${flowName}.json`);
    if (!fs.existsSync(flowPath)) {
      console.error(`Flow '${flowName}' not found`);
      console.log("\nAvailable flows:");
      if (fs.existsSync(FLOWS_DIR)) {
        const flows = fs
          .readdirSync(FLOWS_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""));
        if (flows.length > 0) {
          flows.forEach((f) => console.log(`  ${f}`));
        } else {
          console.log("  (no flows found)");
        }
      }
      return;
    }

    const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));
    console.log(`Executing flow: ${flowName}`);

    const logDir = path.join(LOGS_DIR, `${flowName}_${Date.now()}`);
    fs.mkdirSync(logDir);

    let stepNum = 1;
    const flowContext = [...this.currentContext]; // Save current context

    for (const step of flow.steps) {
      const stepPrefix = String(stepNum).padStart(5, "0");
      const logFile = path.join(logDir, `${stepPrefix}-${step.type}.json`);

      try {
        console.log(`Step ${stepNum}: ${step.type}`);

        switch (step.type) {
          case "navigate":
            this.changeContext(step.path);
            break;

          case "click":
            const click = this.findClick(step.name);
            if (!click) throw new Error(`Click '${step.name}' not found`);

            await this.sendToRobot({
              action: "click",
              x: click.x,
              y: click.y,
              doubleClick: step.doubleClick || false,
            });

            // Only navigate if click has a targetContext
            if (click.targetContext) {
              this.changeContext(click.targetContext);
            }
            break;

          case "type":
            await this.sendToRobot({ action: "type", text: step.text });
            break;

          case "key":
            await this.sendToRobot({ action: "key", keys: step.keys });
            break;

          case "copy":
            const copyResult = await this.sendToRobot({ action: "copy" });
            step.clipboard = copyResult.clipboard;
            break;

          case "paste":
            await this.sendToRobot({ action: "paste" });
            break;

          case "pause":
            if (step.ms) {
              await new Promise((r) => setTimeout(r, step.ms));
            } else if (step.message) {
              await this.ask(`${step.message} (Press Enter to continue)`);
            }
            break;

          case "checkpoint":
            const checkpointResult = await this.executeCheckpoint(
              step.checkpoint
            );
            if (!checkpointResult) {
              throw new Error("Checkpoint failed");
            }
            break;

          case "flow":
            await this.executeFlow(step.flowName);
            break;

          case "scroll":
            await this.sendToRobot({ action: "scroll", amount: step.amount });
            break;
        }

        // Log step
        fs.writeFileSync(
          logFile,
          JSON.stringify({ step, success: true }, null, 2)
        );

        // Take screenshot
        await this.sendToRobot({
          action: "screenshot",
          filename: path.join(logDir, `${stepPrefix}-screenshot.png`),
        });

        stepNum++;
      } catch (error) {
        console.error(`Step ${stepNum} failed:`, error.message);
        fs.writeFileSync(
          logFile,
          JSON.stringify(
            { step, success: false, error: error.message },
            null,
            2
          )
        );

        // Restore context
        this.currentContext = flowContext;
        return;
      }
    }

    // Restore context
    this.currentContext = flowContext;
    console.log(`Flow '${flowName}' completed successfully`);
  }

  async executeCheckpoint(checkpoint) {
    for (const action of checkpoint.actions) {
      switch (action.type) {
        case "doubleClick":
          const click = this.findClick(action.name);
          if (!click) return false;

          await this.sendToRobot({
            action: "click",
            x: click.x,
            y: click.y,
            doubleClick: true,
          });
          break;

        case "copy":
          const result = await this.sendToRobot({ action: "copy" });
          if (action.expect && result.clipboard !== action.expect) {
            console.error(
              `Checkpoint failed: expected '${action.expect}', got '${result.clipboard}'`
            );
            return false;
          }
          break;

        default:
          // Handle other checkpoint actions
          break;
      }
    }
    return true;
  }

  findClick(name) {
    // Search in current context
    const contextObj = this.getCurrentContextObj();
    return contextObj.clicks[name] || null;
  }

  async processCommand(line) {
    const [cmd, ...args] = line.trim().split(" ");

    switch (cmd) {
      case "record":
        await this.recordClick(5);
        break;

      case "recordfast":
      case "rf":
        await this.recordClick(2);
        break;

      case "ls":
        this.listContents();
        break;

      case "cd":
        if (args[0]) {
          this.changeContext(args[0]);
        } else {
          console.log("Current context: " + this.getPrompt());
        }
        break;

      case "mkcontext":
        if (args[0]) this.makeContext(args[0]);
        else console.log("Usage: mkcontext <name>");
        break;

      case "run":
        if (args[0]) {
          await this.executeFlow(args[0]);
        } else {
          console.log("Usage: run <flow-name>");
          console.log("\nAvailable flows:");
          if (fs.existsSync(FLOWS_DIR)) {
            const flows = fs
              .readdirSync(FLOWS_DIR)
              .filter((f) => f.endsWith(".json"))
              .map((f) => f.replace(".json", ""));
            if (flows.length > 0) {
              flows.forEach((f) => console.log(`  ${f}`));
            } else {
              console.log("  (no flows found in flows/ directory)");
            }
          } else {
            console.log("  (flows/ directory not found)");
          }
        }
        break;

      case "clear":
      case "cls":
        console.clear();
        this.printUsage();
        break;

      case "exit":
        this.cleanup();
        process.exit(0);
        break;

      case "help":
      case "?":
        this.printUsage();
        break;

      default:
        if (cmd) {
          console.log(`Unknown command: ${cmd}`);
          console.log('Type "?" or "help" for usage instructions');
        }
    }
  }

  cleanup() {
    if (this.javaProcess) {
      this.javaProcess.kill();
    }
    if (fs.existsSync(INPUT_FILE)) fs.unlinkSync(INPUT_FILE);
    if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
  }

  printUsage() {
    console.log("\n=== Windows Automation CLI ===");
    console.log("\nQuick Start Example:");
    console.log("  /> mkcontext chrome      # Create a chrome context");
    console.log("  /> record                # Record opening chrome");
    console.log("  /> cd chrome             # Enter chrome context");
    console.log(
      "  /chrome> record          # Record clicks (Enter for /chrome, * for any)"
    );
    console.log("  /chrome> cd /            # Go back to root");
    console.log("  /> run my-flow           # Execute an automation");
    console.log("\nCommands:");
    console.log("  record         - Record click with 5 second countdown");
    console.log("  recordfast/rf  - Record click with 2 second countdown");
    console.log(
      "  ls            - List contexts and clicks in current context"
    );
    console.log("  cd <path>     - Change context (cd .., cd /, cd chrome)");
    console.log("  mkcontext <n> - Create new context");
    console.log("  run <flow>    - Execute flow from flows/ directory");
    console.log("  clear/cls     - Clear screen and show help");
    console.log("  help / ?      - Show this help");
    console.log("  exit          - Quit");
    console.log("\nTips:");
    console.log(
      "  - When recording, default (Enter) = navigate to current context"
    );
    console.log('  - Use "*" for clicks that should not change context');
    console.log(
      '  - Use paths like "/chrome" or "../other" for specific navigation'
    );
    console.log("\nCurrent context: " + this.getPrompt());
    console.log("");
  }

  start() {
    this.printUsage();
    this.rl.prompt();

    this.rl.on("line", async (line) => {
      await this.processCommand(line);
      this.rl.prompt();
    });

    this.rl.on("close", () => {
      this.cleanup();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      this.cleanup();
      process.exit(0);
    });
  }
}

new AutomationCLI();
