import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "discord.js";
import { z } from "zod";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { toolList } from './toolList.js';
import {
  createToolContext,
  loginHandler,
  sendMessageHandler,
  getForumChannelsHandler,
  createForumPostHandler,
  getForumPostHandler,
  replyToForumHandler,
  deleteForumPostHandler,
  createTextChannelHandler,
  deleteChannelHandler,
  readMessagesHandler,
  getServerInfoHandler,
  addReactionHandler,
  addMultipleReactionsHandler,
  removeReactionHandler,
  deleteMessageHandler,
  createWebhookHandler,
  sendWebhookMessageHandler,
  editWebhookHandler,
  deleteWebhookHandler
} from './tools/tools.js';
import { MCPTransport } from './transport.js';

export class DiscordMCPServer {
  private server: Server;
  private toolContext: ReturnType<typeof createToolContext>;

  constructor(
    private client: Client, 
    private transport: MCPTransport
  ) {
    this.server = new Server(
      {
        name: "MCP-Discord",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.toolContext = createToolContext(client);
    this.setupHandlers();
  }

  private setupHandlers() {
    // Set up the tool list
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: toolList
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let toolResponse;
        switch (name) {
          case "discord_login":
            toolResponse = await loginHandler(args, this.toolContext);
            return toolResponse;

          case "discord_send":
            toolResponse = await sendMessageHandler(args, this.toolContext);
            return toolResponse;

          case "discord_get_forum_channels":
            toolResponse = await getForumChannelsHandler(args, this.toolContext);
            return toolResponse;

          case "discord_create_forum_post":
            toolResponse = await createForumPostHandler(args, this.toolContext);
            return toolResponse;

          case "discord_get_forum_post":
            toolResponse = await getForumPostHandler(args, this.toolContext);
            return toolResponse;

          case "discord_reply_to_forum":
            toolResponse = await replyToForumHandler(args, this.toolContext);
            return toolResponse;

          case "discord_delete_forum_post":
            toolResponse = await deleteForumPostHandler(args, this.toolContext);
            return toolResponse;

          case "discord_create_text_channel":
            toolResponse = await createTextChannelHandler(args, this.toolContext);
            return toolResponse;

          case "discord_delete_channel":
            toolResponse = await deleteChannelHandler(args, this.toolContext);
            return toolResponse;

          case "discord_read_messages":
            toolResponse = await readMessagesHandler(args, this.toolContext);
            return toolResponse;

          case "discord_get_server_info":
            toolResponse = await getServerInfoHandler(args, this.toolContext);
            return toolResponse;

          case "discord_add_reaction":
            toolResponse = await addReactionHandler(args, this.toolContext);
            return toolResponse;

          case "discord_add_multiple_reactions":
            toolResponse = await addMultipleReactionsHandler(args, this.toolContext);
            return toolResponse;

          case "discord_remove_reaction":
            toolResponse = await removeReactionHandler(args, this.toolContext);
            return toolResponse;

          case "discord_delete_message":
            toolResponse = await deleteMessageHandler(args, this.toolContext);
            return toolResponse;

          case "discord_create_webhook":
            toolResponse = await createWebhookHandler(args, this.toolContext);
            return toolResponse;

          case "discord_send_webhook_message":
            toolResponse = await sendWebhookMessageHandler(args, this.toolContext);
            return toolResponse;

          case "discord_edit_webhook":
            toolResponse = await editWebhookHandler(args, this.toolContext);
            return toolResponse;

          case "discord_delete_webhook":
            toolResponse = await deleteWebhookHandler(args, this.toolContext);
            return toolResponse;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            content: [{
              type: "text",
              text: `Invalid arguments: ${error.errors
                .map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
                .join(", ")}`
            }],
            isError: true
          };
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: "text", text: `Error executing tool: ${errorMessage}` }],
          isError: true
        };
      }
    });
  }

  async start() {
    // Add client to server context so transport can access it
    (this.server as any)._context = { client: this.client };
    (this.server as any).client = this.client;
    
    await this.transport.start(this.server);
  }

  async stop() {
    await this.transport.stop();
  }
} 