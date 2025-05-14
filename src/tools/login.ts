import { DiscordLoginSchema } from '../schemas.js';
import { ToolHandler } from './types.js';
import { handleDiscordError } from "../errorHandler.js";

export const loginHandler: ToolHandler = async (args, { client }) => {
  DiscordLoginSchema.parse(args);
  
  try {
    // Check if token is provided in the request
    const token = args.token;
    
    // If token is provided and client is already logged in, logout first
    if (token && client.isReady()) {
      const currentBotTag = client.user?.tag || 'Unknown';
      // Destroy the client connection to logout
      await client.destroy();
      // Set the new token
      client.token = token;
      
      // Login with the new token
      await client.login(token);
      return {
        content: [{ type: "text", text: `Successfully switched from ${currentBotTag} to ${client.user?.tag}` }]
      };
    }
    
    // Check if client is already logged in (and no new token provided)
    if (client.isReady()) {
      return {
        content: [{ type: "text", text: `Already logged in as: ${client.user?.tag}` }]
      };
    }
    
    // If token is provided in the request, use it
    if (token) {
      client.token = token;
    }
    
    // Token needs to be set before login
    if (!client.token) {
      return {
        content: [{ type: "text", text: "Discord token not configured. Cannot log in. Please provide a token in your request or configure it using environment variables." }],
        isError: true
      };
    }
    
    await client.login(client.token);
    return {
      content: [{ type: "text", text: `Successfully logged in to Discord: ${client.user?.tag}` }]
    };
  } catch (error) {
    return handleDiscordError(error);
  }
}; 