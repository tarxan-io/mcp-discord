import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";
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
import { Client } from "discord.js";
import { info, error } from './logger.js';

export interface MCPTransport {
    start(server: Server): Promise<void>;
    stop(): Promise<void>;
}

export class StdioTransport implements MCPTransport {
    private transport: StdioServerTransport | null = null;

    async start(server: Server): Promise<void> {
        this.transport = new StdioServerTransport();
        await server.connect(this.transport);
    }

    async stop(): Promise<void> {
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
    }
}

export class StreamableHttpTransport implements MCPTransport {
    private app: express.Application;
    private server: Server | null = null;
    private httpServer: any = null;
    private transport: StreamableHTTPServerTransport | null = null;
    private toolContext: ReturnType<typeof createToolContext> | null = null;

    constructor(private port: number = 3000) {
        this.app = express();
        this.app.use(express.json());
        this.setupEndpoints();
    }

    private setupEndpoints() {
        // Handler for POST requests
        this.app.post('/mcp', (req: Request, res: Response) => {
            info('Received MCP request: ' + JSON.stringify(req.body));
            this.handleMcpRequest(req, res).catch(error => {
                error('Unhandled error in MCP request: ' + String(error));
            });
        });

        // Handler for non-POST methods
        this.app.all('/mcp', (req: Request, res: Response) => {
            if (req.method !== 'POST') {
                res.status(405).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Method not allowed. Use POST.',
                    },
                    id: null,
                });
            }
        });
    }

    private async handleMcpRequest(req: Request, res: Response) {
        try {
            if (!this.server) {
                return res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Server not initialized',
                    },
                    id: req.body?.id || null,
                });
            }
            
            info('Request body: ' + JSON.stringify(req.body));
            
            // Handle all tool requests in a generic way
            if (!req.body.method) {
                return res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32600,
                        message: 'Invalid Request: No method specified',
                    },
                    id: req.body?.id || null,
                });
            }
            
            // Handle all tools directly with proper error handling
            try {
                const method = req.body.method;
                const params = req.body.params || {};
                
                // Make sure toolContext is available
                if (!this.toolContext && method !== 'list_tools') {
                    return res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Tool context not initialized. Service may need to be restarted.',
                        },
                        id: req.body?.id || null,
                    });
                }
                
                let result;
                
                // Handle each tool method directly
                switch (method) {
                    case 'list_tools':
                        result = { tools: toolList };
                        break;
                        
                    case 'discord_login':
                        result = await loginHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_send':
                        result = await sendMessageHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_get_forum_channels':
                        result = await getForumChannelsHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_create_forum_post':
                        result = await createForumPostHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_get_forum_post':
                        result = await getForumPostHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_reply_to_forum':
                        result = await replyToForumHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_delete_forum_post':
                        result = await deleteForumPostHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_create_text_channel':
                        result = await createTextChannelHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_delete_channel':
                        result = await deleteChannelHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_read_messages':
                        result = await readMessagesHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_get_server_info':
                        result = await getServerInfoHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_add_reaction':
                        result = await addReactionHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_add_multiple_reactions':
                        result = await addMultipleReactionsHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_remove_reaction':
                        result = await removeReactionHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_delete_message':
                        result = await deleteMessageHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_create_webhook':
                        result = await createWebhookHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_send_webhook_message':
                        result = await sendWebhookMessageHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_edit_webhook':
                        result = await editWebhookHandler(params, this.toolContext!);
                        break;
                        
                    case 'discord_delete_webhook':
                        result = await deleteWebhookHandler(params, this.toolContext!);
                        break;
                        
                    default:
                        return res.status(400).json({
                            jsonrpc: '2.0',
                            error: {
                                code: -32601,
                                message: `Method not found: ${method}`,
                            },
                            id: req.body?.id || null,
                        });
                }
                
                info(`Request for ${method} handled successfully`);
                
                // Handle the case where tool handlers return { content, isError }
                if (result && typeof result === 'object' && 'content' in result) {
                    // If it's an error from the tool handler
                    if ('isError' in result && result.isError) {
                        return res.status(400).json({
                            jsonrpc: '2.0',
                            id: req.body.id,
                            error: {
                                code: -32603,
                                message: Array.isArray(result.content) 
                                    ? result.content.map((item: any) => item.text).join(' ') 
                                    : 'Tool execution error'
                            }
                        });
                    }
                    
                    // Return success result but maintain same format as other RPC methods
                    return res.json({
                        jsonrpc: '2.0',
                        id: req.body.id,
                        result: result
                    });
                }
                
                // Standard result format
                return res.json({
                    jsonrpc: '2.0',
                    id: req.body.id,
                    result: result
                });
                
            } catch (err) {
                error('Error processing tool request: ' + String(err));
                // Handle validation errors
                if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
                    return res.status(400).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32602,
                            message: `Invalid parameters: ${err && typeof err === 'object' && 'message' in err ? String((err as any).message) : 'Unknown validation error'}`,
                        },
                        id: req.body?.id || null,
                    });
                }
                // Handle all other errors
                return res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: err instanceof Error ? err.message : 'Unknown error',
                    },
                    id: req.body?.id || null,
                });
            }
            
        } catch (err) {
            error('Error handling MCP request: ' + String(err));
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: req.body?.id || null,
                });
            }
        }
    }

    async start(server: Server): Promise<void> {
        this.server = server;
        info('Starting HTTP transport with server: ' + String(!!this.server));
        
        // Try to get client from the DiscordMCPServer instance
        // First, check if the server is passed from DiscordMCPServer
        if (server) {
            // Try to access client directly from server._context
            const anyServer = server as any;
            let client: Client | undefined;
            
            if (anyServer._context?.client) {
                client = anyServer._context.client;
                info('Found client in server._context');
            } 
            // Also check if the server object has client directly
            else if (anyServer.client instanceof Client) {
                client = anyServer.client;
                info('Found client directly on server object');
            }
            // Look in parent object if available
            else if (anyServer._parent?.client instanceof Client) {
                client = anyServer._parent.client;
                info('Found client in server._parent');
            }
            
            if (client) {
                this.toolContext = createToolContext(client);
                info('Tool context initialized with Discord client');
            } else {
                // Create a dummy client for testing - allows list_tools to work
                info('Unable to get Discord client. Creating tool context without client.');
                this.toolContext = createToolContext({} as Client);
            }
        }
        
        // Create a stateless transport
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined // set to undefined for stateless servers
        });
        
        // Connect the transport
        await this.server.connect(this.transport);
        info('Transport connected');

        return new Promise((resolve) => {
            this.httpServer = this.app.listen(this.port, () => {
                info(`MCP Server listening on port ${this.port}`);
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }

        if (this.server) {
            await this.server.close();
            this.server = null;
        }

        if (this.httpServer) {
            return new Promise((resolve) => {
                this.httpServer.close(() => {
                    info('HTTP server closed');
                    this.httpServer = null;
                    resolve();
                });
            });
        }
    }
} 