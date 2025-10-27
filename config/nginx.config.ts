export interface NginxConfig {
  // Server Configuration
  listen: number;
  serverName: string;

  // Rate Limiting
  rateLimit: {
    api: {
      zone: string;
      rate: string;
      burst: number;
    };
    sandbox: {
      zone: string;
      rate: string;
      burst: number;
    };
  };

  // Upstream Configuration
  upstream: {
    api: {
      servers: string[];
      method: string;
    };
    sandbox: {
      servers: string[];
      method: string;
    };
  };

  // Security Configuration
  security: {
    allowedOrigins: string[];
    allowedMethods: string[];
    allowedHeaders: string[];
    maxBodySize: string;
  };

  // Logging Configuration
  logging: {
    accessLog: string;
    errorLog: string;
    logLevel: string;
  };
}

export const nginxConfig: NginxConfig = {
  // Server Configuration
  listen: parseInt(process.env.NGINX_PORT || '80'),
  serverName: process.env.NGINX_SERVER_NAME || 'localhost',

  // Rate Limiting
  rateLimit: {
    api: {
      zone: 'api_limit',
      rate: process.env.API_RATE_LIMIT || '60r/m',
      burst: parseInt(process.env.API_BURST_LIMIT || '20'),
    },
    sandbox: {
      zone: 'sandbox_limit',
      rate: process.env.SANDBOX_RATE_LIMIT || '30r/m',
      burst: parseInt(process.env.SANDBOX_BURST_LIMIT || '10'),
    },
  },

  // Upstream Configuration
  upstream: {
    api: {
      servers: (process.env.API_SERVERS || 'api:3000').split(','),
      method: 'least_conn',
    },
    sandbox: {
      servers: (process.env.SANDBOX_SERVERS || 'sandbox:4000').split(','),
      method: 'least_conn',
    },
  },

  // Security Configuration
  security: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxBodySize: process.env.MAX_BODY_SIZE || '10m',
  },

  // Logging Configuration
  logging: {
    accessLog: process.env.ACCESS_LOG || '/var/log/nginx/access.log',
    errorLog: process.env.ERROR_LOG || '/var/log/nginx/error.log',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};
