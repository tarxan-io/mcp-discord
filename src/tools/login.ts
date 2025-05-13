import { DiscordLoginSchema } from '../schemas.js';
import { ToolHandler } from './types.js';
import { handleDiscordError } from "../errorHandler.js";

export const loginHandler: ToolHandler = async (args, { client }) => {
  DiscordLoginSchema.parse(args);
  
  try {
    // Check if client is already logged in
    if (client.isReady()) {
      return {
        content: [{ type: "text", text: `Already logged in as: ${client.user?.tag}` }]
      };
    }
    
    // loginHandler doesn't directly handle token, it needs to be set before invocation
    if (!client.token) {
      return {
        content: [{ type: "text", text: "Discord token not configured. Cannot log in. Please check the following:\n1. Make sure the token is correctly set in your config or environment variables.\n\n2. Ensure all required privileged intents (Message Content, Server Members, Presence) are enabled in the Discord Developer Portal for your bot application." }],
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