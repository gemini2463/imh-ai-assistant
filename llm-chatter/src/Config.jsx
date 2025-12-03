const Config = {
  floatingConfig: {
    serverURL: "http://localhost:8080",
    chatType: "OpenAI",
    model: "gpt-5.1",
    systemMessage:
      "You are an expert Natural Language Understanding (NLU) system for a web server management interface. Your task is to analyze user queries and map them to specific intents with high accuracy. Always aim to provide clear, actionable responses that directly address the user's needs. If the user query is unrelated to web server management, politely inform them that you can only assist with web server management tasks. You may deviate from the previous instructions only if the user requests to generate a personality for the server. If requested to generate a personality for the server, then use the user's prompt and the server specifications, as known by you. Explicitly playful and quirky-creative personality generation only. The bash shell environment is AlmaLinux version 8.10. You have root access. Run commands until the task has completed. You have only a 400,000 token context window (GPT-5.1), so do not issue commands that dump huge amounts of data such as ```ls -R /home``` or similar. Exceeding the context window in a single request will cause the session to fail.  Ensure the commands are safe and appropriate for execution on a production server. Prioritize security and best practices. Bias towards action and using commands to complete the task or inquiry.",
    systemProfile: {
      os: {
        name: "AlmaLinux",
        version: "8.10",
        selinux: "disabled",
        kernel: "4.18.0",
        filesystem: {
          root: "ploop-backed ext4",
          quotas: ["user", "group"],
        },
      },
      hardware: {
        cpu_cores: 4,
        memory: {
          total: "8.0Gi",
          used: "1.1Gi",
          free: "3.7Gi",
          buff_cache: "3.2Gi",
          available: "6.8Gi",
          swap_total: "0B",
        },
        vm_tuning: {
          "vm.swappiness": 0,
        },
      },
      disk: {
        filesystems: [
          {
            device: "/dev/ploop48183p1",
            mountpoint: "/",
            size: "160G",
            used: "57G",
            available: "96G",
            use_percent: "38%",
          },
        ],
      },
      control_panel: {
        name: "CWP (Control Web Panel)",
        paths: {
          cwp_nginx_conf: "/usr/local/cwpsrv/conf",
          cwp_admin_root: "/usr/local/cwpsrv/htdocs/admin/admin",
        },
      },
      web_stack: {
        frontend: {
          server: "nginx",
          config_dirs: [
            "/etc/nginx",
            "/etc/nginx/conf.d",
            "/etc/nginx/conf.d/vhosts",
          ],
          role: "public HTTP/HTTPS entrypoint, reverse proxy",
        },
        backend: {
          server: "apache_httpd",
          install_root: "/usr/local/apache",
          config_main: "/usr/local/apache/conf/httpd.conf",
          config_vhosts: "/usr/local/apache/conf.d",
          role: "backend web server (PHP apps, vhosts)",
        },
        cwp_internal: {
          server: "nginx (cwpsrv)",
          config_dir: "/usr/local/cwpsrv/conf",
          role: "CWP panel and related services",
        },
      },
      php: {
        system_cli: "PHP 8.1",
        alt_fpm_versions: ["7.4", "8.0", "8.1", "8.2", "8.3"],
        alt_fpm_root: "/opt/alt",
        cwp_php_fpm_services: ["cwp-phpfpm", "cwpsrv-phpfpm"],
      },
      databases_and_caches: {
        mariadb: {
          version_major: "10.6",
          service_names: ["mariadb", "mysqld"],
          bind: "default MySQL port, IPv4+IPv6",
        },
        redis: {
          bind: "127.0.0.1",
        },
        memcached: {
          bind: "127.0.0.1",
        },
      },
      mail_stack: {
        mta: {
          name: "postfix",
          logs: ["/var/log/maillog", "/var/log/maillog-*"],
          direction_split: "not separated; same logs for inbound+outbound",
        },
        imap_pop3: {
          name: "dovecot",
          logs: [
            "/var/log/dovecot.log",
            "/var/log/dovecot-info.log",
            "/var/log/dovecot-debug.log",
          ],
        },
        dkim: {
          name: "opendkim",
          bind: "localhost",
        },
        policy_daemon: "cbpolicyd",
        ftp: "pure-ftpd",
      },
      dns: {
        server: "named (BIND)",
        ports: ["53/tcp", "53/udp"],
        bind_addresses: ["localhost", "main_public_ip"],
      },
      logging: {
        system: ["/var/log/messages", "/var/log/secure"],
        web: {
          nginx: "/var/log/nginx",
          apache: "/usr/local/apache/logs",
        },
        mail: {
          postfix: "/var/log/maillog*",
          dovecot: "/var/log/dovecot*.log",
        },
        security: ["/var/log/lfd.log*", "/var/log/fail2ban.log*"],
        ftp: "/var/log/pureftpd.log*",
        panel: "/var/log/cwp",
      },
      security_and_monitoring: {
        firewall: "csf",
        lfd: "enabled",
        fail2ban: "installed (used for some jails)",
        monitoring: "monit",
      },
      ssh: {
        service: "sshd",
        auth: {
          password_authentication: false,
          pubkey_authentication: true,
          permit_root_login: true,
        },
        port: "non-default (do not hardcode; detect at runtime)",
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
      "Generate personality for server",
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

  shellScriptPath: "loader_ajax.php?ajax=imh-ai-assistant",
};

export default Config;
