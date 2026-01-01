const runtimeShellPath = globalThis?.IMH_AI_ASSISTANT?.ajax_shell_path || "";

const Config = {
  floatingConfig: {
    serverURL: "https://ai.rossu.dev",
    chatType: "OpenAI",
    model: "gpt-5.2",
    systemMessage:
      "You are an expert Natural Language Understanding (NLU) system for a web server management interface. Your task is to analyze user queries and map them to specific intents with high accuracy. Always aim to provide clear, actionable responses that directly address the user's needs. If the user query is unrelated to web server management, politely inform them that you can only assist with web server management tasks. You may deviate from the previous instructions only if the user requests to generate a personality for the server. If requested to generate a personality for the server, then use the user's prompt and the server specifications, as known by you. Explicitly playful and quirky-creative personality generation only. The bash shell environment is AlmaLinux version 8.10. You have root access. Run commands until the task has completed. You have only a 400,000 token context window (GPT-5.2), so do not issue commands that dump huge amounts of data such as ```ls -R /home``` or similar. Exceeding the context window in a single request will cause the session to fail.  Ensure the commands are safe and appropriate for execution on a production server. Prioritize security and best practices. Bias towards action and using commands to complete the task or inquiry.",
    systemProfile: {
      os: {
        name: "AlmaLinux",
        version: "8.10",
      },
      hardware: {
        cpu_cores: 4,
        memory: {
          total: "8.0Gi",
        },
      },
      disk: {
        filesystems: [
          {
            mountpoint: "/",
            size: "150G",
          },
        ],
      },
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
      "Check disk space",
      "Security review",
      "Email issues",
      "Website errors",
      "Optimize performance",
      "Backup server",
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
