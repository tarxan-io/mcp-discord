import { DiscordLoginSchema } from '../schemas.js';
import { ToolHandler } from './types.js';
import { handleDiscordError } from "../errorHandler.js";
import { info, error } from '../logger.js';

export const loginHandler: ToolHandler = async (args, { client }) => {
  DiscordLoginSchema.parse(args);
  
  try {
    // Check if token is provided in the request
    const token = args.token;

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
      
      // Set the new token
      client.token = token;
      
      // Login with the new token
      info('Attempting login with new token');
      await client.login(token);
      info(`Login successful, new client user: ${client.user?.tag}`);
      
      return {
        content: [{ type: "text", text: `Successfully switched from ${currentBotTag} to ${client.user?.tag}` }]
      };
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
      await client.login(client.token);
      info(`Login successful, client user: ${client.user?.tag}`);
      
      // Verify client is actually ready
      if (!client.isReady()) {
        error('Client login completed but client.isReady() returned false');
        return {
          content: [{ type: "text", text: "Login completed but client is not in ready state. This may indicate an issue with Discord connectivity." }],
          isError: true
        };
      }
      
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