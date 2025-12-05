const Config = {
  clientDomains: [
    "http://localhost:5173",
    "http://localhost:8181",
  ],
  serverBehindCloudflare: false,
  ollamaEnabled: true,
  reasoningModels: [
    "o1",
    "o1-mini",
    //"o1-pro",
    "o3",
    "o3-mini",
    "o4-mini",
    //"o3-pro",
    //"o3-deep-research",
    //"o4-mini-deep-research"
  ],

  imgOutputModels: ["gpt-image-1", "gemini-2.0-flash-preview-image-generation"],

  responsesModels: [
    "gpt-5.1",
    "gpt-5.1-chat-latest",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-chat-latest",
    "grok-4",
    "grok-4-1-fast-reasoning",
    "grok-4-1-fast-non-reasoning",
  ],
  timeFormat: "DD/MM/YYYY HH:mm:ss",

  responseTools: {
    shell: { models: ["gpt-5.1"] },
    /*   image_generation: {
      models: [
        "gpt-5.1",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
            "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3", 
      ],
    },
    apply_patch: {},
    file_search: {},
    web_search: {},
    mcp: {},
    code_interpreter: {},
    local_shell: {},
    custom: {},
    function: {},
    web_search_preview: {},
    computer_use_preview: {}, */
  },
};

export default Config;
