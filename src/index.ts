import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Client, GatewayIntentBits, Events, TextChannel, ForumChannel, ChannelType } from "discord.js";

// Configuration parsing
let config: any = {};

// Read configuration from environment variables
if (process.env.DISCORD_TOKEN) {
    config.DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    console.log("Config loaded from environment variables. Discord token available:", !!config.DISCORD_TOKEN);
    if (config.DISCORD_TOKEN) {
        console.log("Token length:", config.DISCORD_TOKEN.length);
    }
} else {
    // Try to parse configuration from command line arguments (for backward compatibility)
    const configArgIndex = process.argv.indexOf('--config');
    if (configArgIndex !== -1 && configArgIndex < process.argv.length - 1) {
        try {
            let configStr = process.argv[configArgIndex + 1];
            
            // Print raw configuration string for debugging
            console.log("Raw config string:", configStr);
            
            // Try to parse JSON
            config = JSON.parse(configStr);
            console.log("Config parsed successfully. Discord token available:", !!config.DISCORD_TOKEN);
            
            if (config.DISCORD_TOKEN) {
                console.log("Token length:", config.DISCORD_TOKEN.length);
            }
        } catch (error) {
            console.error("Failed to parse config argument:", error);
            console.error("Raw config argument:", process.argv[configArgIndex + 1]);
            
            // Try to read arguments directly (for debugging)
            console.log("All arguments:", process.argv);
        }
    } else {
        console.warn("No config found in environment variables or command line arguments");
        console.log("All arguments:", process.argv);
    }
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Create an MCP server
const server = new McpServer({
    name: "MCP-Discord",
    version: "1.0.0"
});

// Add a test tool
server.tool(
    "test",
    { name: z.string() },
    async () => ({
        content: [{ type: "text", text: `test success` }]
    })
);

// Discord login tool
server.tool(
    "discord_login",
    { random_string: z.string().optional() },
    async () => {
        try {
            const token = config.DISCORD_TOKEN;
            if (!token) {
                return {
                    content: [{ type: "text", text: "Discord token not found in config. Make sure the --config parameter is correctly set." }],
                    isError: true
                };
            }
            
            await client.login(token);
            return {
                content: [{ type: "text", text: `Successfully logged in to Discord : ${client.user?.tag}` }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Login failed: ${error}` }],
                isError: true
            };
        }
    }
);

// Discord send message tool
server.tool(
    "discord_send",
    { 
        channelId: z.string(),
        message: z.string()
    },
    async ({ channelId, message }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                return {
                    content: [{ type: "text", text: `Cannot find text channel ID: ${channelId}` }],
                    isError: true
                };
            }

            // Ensure channel is text-based and can send messages
            if ('send' in channel) {
                await channel.send(message);
                return {
                    content: [{ type: "text", text: `Message successfully sent to channel ID: ${channelId}` }]
                };
            } else {
                return {
                    content: [{ type: "text", text: `This channel type does not support sending messages` }],
                    isError: true
                };
            }
        } catch (error) {
            return {
                content: [{ type: "text", text: `Send message failed: ${error}` }],
                isError: true
            };
        }
    }
);

// Get forum channels tool
server.tool(
    "discord_get_forum_channels",
    { 
        guildId: z.string()
    },
    async ({ guildId }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                return {
                    content: [{ type: "text", text: `Cannot find guild with ID: ${guildId}` }],
                    isError: true
                };
            }

            // Fetch all channels from the guild
            const channels = await guild.channels.fetch();
            
            // Filter to get only forum channels
            const forumChannels = channels.filter(channel => channel?.type === ChannelType.GuildForum);
            
            if (forumChannels.size === 0) {
                return {
                    content: [{ type: "text", text: `No forum channels found in guild: ${guild.name}` }]
                };
            }

            // Format forum channels information
            const forumInfo = forumChannels.map(channel => ({
                id: channel.id,
                name: channel.name,
                topic: channel.topic || "No topic set"
            }));

            return {
                content: [{ type: "text", text: JSON.stringify(forumInfo, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to fetch forum channels: ${error}` }],
                isError: true
            };
        }
    }
);

// Create forum post tool
server.tool(
    "discord_create_forum_post",
    { 
        forumChannelId: z.string(),
        title: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional()
    },
    async ({ forumChannelId, title, content, tags }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(forumChannelId);
            if (!channel || channel.type !== ChannelType.GuildForum) {
                return {
                    content: [{ type: "text", text: `Channel ID ${forumChannelId} is not a forum channel.` }],
                    isError: true
                };
            }

            const forumChannel = channel as ForumChannel;
            
            // Get available tags in the forum
            const availableTags = forumChannel.availableTags;
            let selectedTagIds: string[] = [];
            
            // If tags are provided, find their IDs
            if (tags && tags.length > 0) {
                selectedTagIds = availableTags
                    .filter(tag => tags.includes(tag.name))
                    .map(tag => tag.id);
            }

            // Create the forum post
            const thread = await forumChannel.threads.create({
                name: title,
                message: {
                    content: content
                },
                appliedTags: selectedTagIds.length > 0 ? selectedTagIds : undefined
            });

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully created forum post "${title}" with ID: ${thread.id}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to create forum post: ${error}` }],
                isError: true
            };
        }
    }
);

// Get forum post (thread) details tool
server.tool(
    "discord_get_forum_post",
    { 
        threadId: z.string()
    },
    async ({ threadId }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const thread = await client.channels.fetch(threadId);
            if (!thread || !(thread.isThread())) {
                return {
                    content: [{ type: "text", text: `Cannot find thread with ID: ${threadId}` }],
                    isError: true
                };
            }

            // Get messages from the thread
            const messages = await thread.messages.fetch({ limit: 10 });
            
            const threadDetails = {
                id: thread.id,
                name: thread.name,
                parentId: thread.parentId,
                messageCount: messages.size,
                createdAt: thread.createdAt,
                messages: messages.map(msg => ({
                    id: msg.id,
                    content: msg.content,
                    author: msg.author.tag,
                    createdAt: msg.createdAt
                }))
            };

            return {
                content: [{ type: "text", text: JSON.stringify(threadDetails, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to fetch forum post: ${error}` }],
                isError: true
            };
        }
    }
);

// Reply to forum post tool
server.tool(
    "discord_reply_to_forum",
    { 
        threadId: z.string(),
        message: z.string()
    },
    async ({ threadId, message }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const thread = await client.channels.fetch(threadId);
            if (!thread || !(thread.isThread())) {
                return {
                    content: [{ type: "text", text: `Cannot find thread with ID: ${threadId}` }],
                    isError: true
                };
            }

            if (!('send' in thread)) {
                return {
                    content: [{ type: "text", text: `This thread does not support sending messages` }],
                    isError: true
                };
            }

            // Send the reply
            const sentMessage = await thread.send(message);

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully replied to forum post. Message ID: ${sentMessage.id}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to reply to forum post: ${error}` }],
                isError: true
            };
        }
    }
);

// Create text channel tool
server.tool(
    "discord_create_text_channel",
    { 
        guildId: z.string(),
        channelName: z.string(),
        topic: z.string().optional()
    },
    async ({ guildId, channelName, topic }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                return {
                    content: [{ type: "text", text: `Cannot find guild with ID: ${guildId}` }],
                    isError: true
                };
            }

            // Create the text channel
            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                topic: topic
            });

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully created text channel "${channelName}" with ID: ${channel.id}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to create text channel: ${error}` }],
                isError: true
            };
        }
    }
);

// Delete channel tool
server.tool(
    "discord_delete_channel",
    { 
        channelId: z.string(),
        reason: z.string().optional()
    },
    async ({ channelId, reason }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel) {
                return {
                    content: [{ type: "text", text: `Cannot find channel with ID: ${channelId}` }],
                    isError: true
                };
            }

            // Check if channel can be deleted (has delete method)
            if (!('delete' in channel)) {
                return {
                    content: [{ type: "text", text: `This channel type does not support deletion or the bot lacks permissions` }],
                    isError: true
                };
            }

            // Delete the channel
            await channel.delete(reason || "Channel deleted via API");

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully deleted channel with ID: ${channelId}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to delete channel: ${error}` }],
                isError: true
            };
        }
    }
);

// Read messages from channel tool
server.tool(
    "discord_read_messages",
    { 
        channelId: z.string(),
        limit: z.number().min(1).max(100).optional().default(50)
    },
    async ({ channelId, limit }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel) {
                return {
                    content: [{ type: "text", text: `Cannot find channel with ID: ${channelId}` }],
                    isError: true
                };
            }

            // Check if channel has messages (text channel, thread, etc.)
            if (!channel.isTextBased() || !('messages' in channel)) {
                return {
                    content: [{ type: "text", text: `Channel type does not support reading messages` }],
                    isError: true
                };
            }

            // Fetch messages
            const messages = await channel.messages.fetch({ limit });
            
            if (messages.size === 0) {
                return {
                    content: [{ type: "text", text: `No messages found in channel` }]
                };
            }

            // Format messages 
            const formattedMessages = messages.map(msg => ({
                id: msg.id,
                content: msg.content,
                author: {
                    id: msg.author.id,
                    username: msg.author.username,
                    bot: msg.author.bot
                },
                timestamp: msg.createdAt,
                attachments: msg.attachments.size,
                embeds: msg.embeds.length,
                replyTo: msg.reference ? msg.reference.messageId : null
            })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        channelId,
                        messageCount: formattedMessages.length,
                        messages: formattedMessages
                    }, null, 2) 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to read messages: ${error}` }],
                isError: true
            };
        }
    }
);

// Get server information tool
server.tool(
    "discord_get_server_info",
    { 
        guildId: z.string()
    },
    async ({ guildId }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                return {
                    content: [{ type: "text", text: `Cannot find guild with ID: ${guildId}` }],
                    isError: true
                };
            }

            // Fetch additional guild data
            await guild.fetch();
            
            // Fetch channel information
            const channels = await guild.channels.fetch();
            
            // Categorize channels by type
            const channelsByType = {
                text: channels.filter(c => c?.type === ChannelType.GuildText).size,
                voice: channels.filter(c => c?.type === ChannelType.GuildVoice).size,
                category: channels.filter(c => c?.type === ChannelType.GuildCategory).size,
                forum: channels.filter(c => c?.type === ChannelType.GuildForum).size,
                announcement: channels.filter(c => c?.type === ChannelType.GuildAnnouncement).size,
                stage: channels.filter(c => c?.type === ChannelType.GuildStageVoice).size,
                total: channels.size
            };
            
            // Fetch member count
            const approximateMemberCount = guild.approximateMemberCount || "unknown";
            
            // Format guild information
            const guildInfo = {
                id: guild.id,
                name: guild.name,
                description: guild.description,
                icon: guild.iconURL(),
                owner: guild.ownerId,
                createdAt: guild.createdAt,
                memberCount: approximateMemberCount,
                channels: channelsByType,
                features: guild.features,
                premium: {
                    tier: guild.premiumTier,
                    subscriptions: guild.premiumSubscriptionCount
                }
            };

            return {
                content: [{ type: "text", text: JSON.stringify(guildInfo, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to fetch server info: ${error}` }],
                isError: true
            };
        }
    }
);

// Add reaction to message tool
server.tool(
    "discord_add_reaction",
    { 
        channelId: z.string(),
        messageId: z.string(),
        emoji: z.string()
    },
    async ({ channelId, messageId, emoji }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased() || !('messages' in channel)) {
                return {
                    content: [{ type: "text", text: `Cannot find text channel with ID: ${channelId}` }],
                    isError: true
                };
            }

            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return {
                    content: [{ type: "text", text: `Cannot find message with ID: ${messageId}` }],
                    isError: true
                };
            }

            // Add the reaction
            await message.react(emoji);

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully added reaction ${emoji} to message ID: ${messageId}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to add reaction: ${error}` }],
                isError: true
            };
        }
    }
);

// Add multiple reactions to message tool
server.tool(
    "discord_add_multiple_reactions",
    { 
        channelId: z.string(),
        messageId: z.string(),
        emojis: z.array(z.string())
    },
    async ({ channelId, messageId, emojis }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased() || !('messages' in channel)) {
                return {
                    content: [{ type: "text", text: `Cannot find text channel with ID: ${channelId}` }],
                    isError: true
                };
            }

            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return {
                    content: [{ type: "text", text: `Cannot find message with ID: ${messageId}` }],
                    isError: true
                };
            }

            // Add each reaction sequentially
            for (const emoji of emojis) {
                await message.react(emoji);
                // Small delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully added ${emojis.length} reactions to message ID: ${messageId}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to add reactions: ${error}` }],
                isError: true
            };
        }
    }
);

// Remove reaction from message tool
server.tool(
    "discord_remove_reaction",
    { 
        channelId: z.string(),
        messageId: z.string(),
        emoji: z.string(),
        userId: z.string().optional()
    },
    async ({ channelId, messageId, emoji, userId }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased() || !('messages' in channel)) {
                return {
                    content: [{ type: "text", text: `Cannot find text channel with ID: ${channelId}` }],
                    isError: true
                };
            }

            const message = await channel.messages.fetch(messageId);
            if (!message) {
                return {
                    content: [{ type: "text", text: `Cannot find message with ID: ${messageId}` }],
                    isError: true
                };
            }

            // Get the reactions
            const reactions = message.reactions.cache;
            
            // Find the specific reaction
            const reaction = reactions.find(r => r.emoji.toString() === emoji || r.emoji.name === emoji);
            
            if (!reaction) {
                return {
                    content: [{ type: "text", text: `Reaction ${emoji} not found on message ID: ${messageId}` }],
                    isError: true
                };
            }
            
            if (userId) {
                // Remove a specific user's reaction
                await reaction.users.remove(userId);
                return {
                    content: [{ 
                        type: "text", 
                        text: `Successfully removed reaction ${emoji} from user ID: ${userId} on message ID: ${messageId}` 
                    }]
                };
            } else {
                // Remove bot's reaction
                await reaction.users.remove(client.user.id);
                return {
                    content: [{ 
                        type: "text", 
                        text: `Successfully removed bot's reaction ${emoji} from message ID: ${messageId}` 
                    }]
                };
            }
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to remove reaction: ${error}` }],
                isError: true
            };
        }
    }
);

// Delete forum post tool
server.tool(
    "discord_delete_forum_post",
    { 
        threadId: z.string(),
        reason: z.string().optional()
    },
    async ({ threadId, reason }) => {
        try {
            if (!client.isReady()) {
                return {
                    content: [{ type: "text", text: "Discord client not logged in. Please use discord_login tool first." }],
                    isError: true
                };
            }

            const thread = await client.channels.fetch(threadId);
            if (!thread || !thread.isThread()) {
                return {
                    content: [{ type: "text", text: `Cannot find forum post/thread with ID: ${threadId}` }],
                    isError: true
                };
            }

            // Delete the forum post/thread
            await thread.delete(reason || "Forum post deleted via API");

            return {
                content: [{ 
                    type: "text", 
                    text: `Successfully deleted forum post/thread with ID: ${threadId}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Failed to delete forum post: ${error}` }],
                isError: true
            };
        }
    }
);

// Auto-login on startup if token is available
const autoLogin = async () => {
    const token = config.DISCORD_TOKEN;
    if (token) {
        try {
            await client.login(token);
        } catch (error) {
            console.error("Auto-login failed:", error);
        }
    } else {
        console.log("No Discord token found in config, skipping auto-login");
    }
};

// Start auto-login process
autoLogin();
  
const transport = new StdioServerTransport();
await server.connect(transport);