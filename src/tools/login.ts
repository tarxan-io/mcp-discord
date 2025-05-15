import { DiscordLoginSchema } from '../schemas.js';
import { ToolHandler } from './types.js';
import { handleDiscordError } from "../errorHandler.js";
import { info, error } from '../logger.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { createToolContext } from './tools.js';

// Create a function to properly wait for client to be ready
async function waitForReady(client: Client, token: string, timeoutMs = 10000): Promise<Client> {
  return new Promise((resolve, reject) => {
    // Set a timeout to prevent hanging if ready event never fires
    const timeout = setTimeout(() => {
      reject(new Error(`Client ready event timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // If client is already ready, resolve immediately
    if (client.isReady()) {
      clearTimeout(timeout);
      resolve(client);
      return;
    }
    
    // Listen for ready event
    const readyHandler = () => {
      info('Client ready event received');
      clearTimeout(timeout);
      resolve(client);
    };
    
    // Listen for error event
    const errorHandler = (err: Error) => {
      clearTimeout(timeout);
      client.removeListener('ready', readyHandler);
      reject(err);
    };
    
    // Attach listeners
    client.once('ready', readyHandler);
    client.once('error', errorHandler);
    
    // Start login process
    info('Starting login process and waiting for ready event');
    client.login(token).catch((err: Error) => {
      clearTimeout(timeout);
      client.removeListener('ready', readyHandler);
      client.removeListener('error', errorHandler);
      reject(err);
    });
  });
}

export const loginHandler: ToolHandler = async (args, context) => {
  DiscordLoginSchema.parse(args);
  
  try {
    // Check if token is provided in the request
    const token = args.token;
    let { client } = context;

    // Log initial client state
    info(`Login handler called with client state: ${JSON.stringify({
      isReady: client.isReady(),
      hasToken: !!client.token,
      hasArgsToken: !!token,
      user: client.user ? {
        id: client.user.id,
        tag: client.user.tag,
      } : null
    })}`);
    
    // If token is provided and client is already logged in, logout first
    if (token && client.isReady()) {
      const currentBotTag = client.user?.tag || 'Unknown';
      info(`Logging out current client (${currentBotTag}) to switch to new token`);
      
      // Destroy the client connection to logout
      await client.destroy();
      info('Client destroyed successfully');
      
      // Create a new client instead of reusing the old one
      info('Creating new client instance for new token');
      const newClient = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageReactions
        ]
      });
      
      // Replace the old client in the context
      Object.assign(context, { client: newClient });
      client = newClient;
      
      // Set the token on the new client
      client.token = token;
      info(`Token set on new client: ${!!client.token}`);
      
      // Login with the new token
      info('Attempting login with new token on new client');
      try {
        // Replace direct login with waitForReady
        info('Waiting for client ready event');
        await waitForReady(client, token);
        info(`Login successful and client is ready, new client user: ${client.user?.tag}`);
        
        return {
          content: [{ type: "text", text: `Successfully switched from ${currentBotTag} to ${client.user?.tag}` }]
        };
      } catch (innerError) {
        error(`Failed to login after destroy: ${innerError instanceof Error ? innerError.message : String(innerError)}`);
        return handleDiscordError(innerError);
      }
    }
    
    // Check if client is already logged in (and no new token provided)
    if (client.isReady()) {
      info(`Client already logged in as: ${client.user?.tag}`);
      return {
        content: [{ type: "text", text: `Already logged in as: ${client.user?.tag}` }]
      };
    }
    
    // If token is provided in the request, use it
    if (token) {
      info('Setting token from request');
      client.token = token;
      info(`Token set to request value: ${!!client.token}`);
    } else {
      info('No token in request, checking for existing token');
    }
    
    // Token needs to be set before login
    if (!client.token) {
      error('No token available for login');
      return {
        content: [{ type: "text", text: "Discord token not configured. Cannot log in. Please provide a token in your request or configure it using environment variables." }],
        isError: true
      };
    }
    
    info('Attempting login with token');
    try {
      // Replace direct login with waitForReady
      info('Waiting for client ready event');
      await waitForReady(client, token || client.token);
      info(`Login successful and client is ready, client user: ${client.user?.tag}`);
      
      info(`Login fully completed, ready state: ${client.isReady()}`);
      return {
        content: [{ type: "text", text: `Successfully logged in to Discord: ${client.user?.tag}` }]
      };
    } catch (loginError) {
      error(`Login attempt failed: ${loginError instanceof Error ? loginError.message : String(loginError)}`);
      return handleDiscordError(loginError);
    }
  } catch (err) {
    error(`Error in login handler: ${err instanceof Error ? err.message : String(err)}`);
    return handleDiscordError(err);
  }
}; 