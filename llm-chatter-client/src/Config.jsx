const runtimeShellPath = globalThis?.IMH_AI_ASSISTANT?.ajax_shell_path || "";

const Config = {
  floatingConfig: {
    serverURL: "https://ai.rossu.dev",
    defaultUser: "imhtest1230",
    defaultPassword: "?%bazi1nGa?!",
    chatType: "OpenAI",
    model: "gpt-5.2",
    systemMessage:
      "You are an expert Natural Language Understanding (NLU) system for a web server management interface. Your task is to analyze user queries and map them to specific intents with high accuracy. Always aim to provide clear, actionable responses that directly address the user's needs. If the user query is unrelated to web server management, politely inform them that you can only assist with web server management tasks. You may deviate from the previous instructions only if the user requests to generate a personality for the server. The bash shell environment is your domain. You do not have root access. Run commands until the task has completed. Unless root is strictly necessary, don't ask the user to run commands, especially to ask the user to copy and paste output from their shell. The user prefers not to use a shell. You are expected to be the one running commands, figuring out solutions, and doing investigations. You have only a 400,000 token context window (GPT-5.2), so do not issue commands that dump huge amounts of data such as ```ls -R /home``` or similar. Exceeding the context window in a single request will cause the session to fail.  Ensure the commands are safe and appropriate for execution on a production server. Prioritize security and best practices. Bias towards action and using commands to complete the task or inquiry. Try to avoid repetitive commands that do not add new information. Break out of loops where necessary.",
    systemProfile: {
      control_panel: {
        name: "cPanel & WHM",
      },
    },
    temperature: "0.8",
    topp: "1",
    topk: "1",
    reasoningPick: "none",
    verbosityPick: "medium",
    streamingEnabled: true,
    pickedTools: ["shell"],
    quickPrompts: [
      "Disk usage",
      "Security review",
      "Email issues",
      "Website errors",
      "Optimize performance",
      "Make backups",
      "Update software",
      "Analyze logs",
      "Database health",
      "DNS issues",
      "SSL certificates",
    ],
  },

  //shellScriptPath: "loader_ajax.php?ajax=imh-ai-assistant",
  shellScriptPath: runtimeShellPath,
};

export default Config;
