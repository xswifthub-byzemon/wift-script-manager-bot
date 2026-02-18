const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
require('dotenv').config();

// --- ⚙️ CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

// Domain Handler
let rawDomain = process.env.PUBLIC_DOMAIN || '';
rawDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
const DOMAIN = rawDomain || 'wift-script-manager-bot-production.up.railway.app'; 

const SCRIPT_DB_FILE = './scripts.json';
const STATUS_DB_FILE = './status.json';
const PANEL_DB_FILE = './panels.json'; 
const DEFAULT_IMG = 'https://cdn.discordapp.com/attachments/1449112368977281117/1473691141802299475/IMG_0939.png'; 

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const app = express();

// --- 🌐 WEB SERVER ---
app.get('/', (req, res) => {
    res.send('<h1 style="color:green; font-family:sans-serif; text-align:center; margin-top:20%;">🤖 Swift Script Hub is Running!</h1>');
});

app.get('/view/:key', (req, res) => {
    const key = req.params.key;
    const lang = req.query.lang || 'th';
    
    if (!scriptDatabase[key]) return res.status(404).send('<h1 style="color:red; text-align:center;">404 - Not Found</h1>');

    if (!scriptDatabase[key].views) scriptDatabase[key].views = 0;
    scriptDatabase[key].views += 1;
    saveScriptData(); 

    const scriptData = scriptDatabase[key];
    const code = scriptData.code;
    const img = scriptData.image || DEFAULT_IMG;

    const isEN = lang === 'en';
    const data = {
        copyBtn: isEN ? 'COPY SCRIPT' : 'คัดลอกสคริปต์',
        warning: isEN ? '⚠️ Use at your own risk. Play safe!' : '⚠️ การใช้งานมีความเสี่ยง โปรดเล่นอย่างระมัดระวัง',
        menuContact: isEN ? 'Contact Admin / Staff' : 'ติดต่อแอดมินและทีมงาน',
        discordDesc: isEN ? 'Join our community for updates and support! 🎮' : 'เข้ามาร่วมพูดคุย อัปเดตข่าวสาร และแจ้งปัญหาได้ที่นี่เลยครับ! 🎮',
        copyLinkBtn: isEN ? 'Copy Invite Link 🔗' : 'คัดลอกลิ้งค์ดิสคอร์ด 🔗',
        copiedText: isEN ? '✅ Copied!' : '✅ คัดลอกแล้ว!'
    };

    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) return res.status(500).send('Error loading template');
        let finalHtml = html
            .replace('{{IMAGE_URL}}', img)
            .replace('{{SCRIPT_NAME}}', key)
            .replace('{{SCRIPT_CODE}}', code)
            .replace('{{COPY_BTN}}', data.copyBtn)
            .replace('{{WARNING_TEXT}}', data.warning)
            .replace('{{MENU_CONTACT}}', data.menuContact)
            .replace('{{DISCORD_DESC}}', data.discordDesc)
            .replace('{{COPY_LINK_BTN}}', data.copyLinkBtn)
            .replace('{{COPIED_TEXT}}', data.copiedText)
            .replace('{{VIEWS}}', scriptData.views); 
        res.send(finalHtml);
    });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Website online on port ${PORT}`));

// --- 📂 DATABASE ---
let scriptDatabase = {};
let statusDatabase = {}; 
let panelDatabase = {}; 
let userSelections = new Map(); // เก็บค่าแยกกันด้วย key: userId_lang
let userCooldowns = new Map();  // เก็บเวลาคูลดาวน์: userId -> timestamp
let activeEditTarget = null, tempStatusName = null; 

let activeScriptPanelEN = null, activeScriptPanelTH = null, activeAdminScriptPanel = null;
let activeStatusPanel = null, activeStatusAdminPanel = null, activeWebStatsPanel = null;

function loadData() {
    if (fs.existsSync(SCRIPT_DB_FILE)) { try { scriptDatabase = JSON.parse(fs.readFileSync(SCRIPT_DB_FILE, 'utf8')); } catch (e) { scriptDatabase = {}; } }
    if (fs.existsSync(STATUS_DB_FILE)) { try { statusDatabase = JSON.parse(fs.readFileSync(STATUS_DB_FILE, 'utf8')); } catch (e) { statusDatabase = {}; } }
    if (fs.existsSync(PANEL_DB_FILE)) { try { panelDatabase = JSON.parse(fs.readFileSync(PANEL_DB_FILE, 'utf8')); } catch (e) { panelDatabase = {}; } }
}
loadData();

async function saveScriptData() { fs.writeFileSync(SCRIPT_DB_FILE, JSON.stringify(scriptDatabase, null, 4)); await updateAllScriptDashboards(); }
async function saveStatusData() { fs.writeFileSync(STATUS_DB_FILE, JSON.stringify(statusDatabase, null, 4)); await updateStatusDashboard(); }
async function savePanelData() { fs.writeFileSync(PANEL_DB_FILE, JSON.stringify(panelDatabase, null, 4)); }

// --- 🔥 COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('admin').setDescription('🔧 Script Admin Panel'),
    new SlashCommandBuilder().setName('status-admin').setDescription('🔧 Status Admin Panel'),
    new SlashCommandBuilder().setName('getscript-en').setDescription('🇺🇸 User Panel (EN)'),
    new SlashCommandBuilder().setName('getscript-th').setDescription('🇹🇭 User Panel (TH)'),
    new SlashCommandBuilder().setName('status-panel').setDescription('📊 Status Dashboard'),
    new SlashCommandBuilder().setName('web-stats').setDescription('📈 View Stats (Owner Only)'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (error) { console.error(error); }
    
    // Auto-Restore
    restorePanel('th', (msg) => activeScriptPanelTH = msg);
    restorePanel('en', (msg) => activeScriptPanelEN = msg);
    restorePanel('admin', (msg) => activeAdminScriptPanel = msg);
    restorePanel('status', (msg) => activeStatusPanel = msg);
    restorePanel('webstats', (msg) => activeWebStatsPanel = msg);
});

async function restorePanel(type, setter) {
    if (panelDatabase[type]) {
        try {
            const channel = await client.channels.fetch(panelDatabase[type].channelId);
            if (channel) {
                const msg = await channel.messages.fetch(panelDatabase[type].messageId);
                if (msg) setter(msg);
            }
        } catch (e) {}
    }
}

// --- 🎨 DASHBOARDS ---
async function generateUserPanelPayload(lang) {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;
    const isEN = lang === 'en';

    const embed = new EmbedBuilder().setColor(hasScripts ? '#0099ff' : '#808080').setThumbnail(client.user.displayAvatarURL());
    
    if (isEN) {
        embed.setTitle('📂 Swift Script Hub Service');
        embed.setFooter({ text: 'Powered by Pai ❤️ | Select script & Click button' });
        if (hasScripts) {
            const list = scriptKeys.map((k, i) => `> **Script ${i + 1}** : ${k}`).join('\n');
            embed.setDescription(`**Thank you for using Swift Hub!** ❤️\nWe provide high-quality scripts just for you.\n\n⚠️ **Warning:** Using scripts involves risk. Please play responsibly.\n----------------------------------------------------\n**📜 Available Scripts (${scriptKeys.length}):**\n${list}\n\n*Select a script below and click "Get Script Link".*`);
        } else { embed.setDescription('❌ **Out of Stock**'); }
    } else {
        embed.setTitle('📂 Swift Script Hub บริการแจกสคริปต์');
        embed.setFooter({ text: 'Powered by Pai ❤️ | เลือกสคริปต์แล้วกดปุ่มรับลิ้งค์' });
        if (hasScripts) {
            const list = scriptKeys.map((k, i) => `> **สคริปต์ ${i + 1}** : ${k}`).join('\n');
            embed.setDescription(`**ขอบคุณที่ไว้ใจใช้บริการ Swift Hub นะคะ** ❤️\nเราคัดสรรสคริปต์คุณภาพมาเพื่อคุณโดยเฉพาะ\n\n⚠️ **คำเตือน:** การใช้สคริปต์มีความเสี่ยง โปรดเล่นอย่างมีสติ\n----------------------------------------------------\n**📜 สคริปต์ที่พร้อมใช้งาน (${scriptKeys.length}):**\n${list}\n\n*เลือกสคริปต์จากเมนูด้านล่าง แล้วกดปุ่ม "รับลิ้งค์สคริปต์" นะคะ*`);
        } else { embed.setDescription('❌ **คลังว่างเปล่า**'); }
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(isEN ? 'select_script_en' : 'select_script_th')
        .setPlaceholder(hasScripts ? (isEN ? '🔻 Select your script...' : '🔻 เลือกสคริปต์ที่ต้องการ...') : '⛔ Empty')
        .setDisabled(!hasScripts);

    if (hasScripts) {
        selectMenu.addOptions([
            { label: isEN ? '❌ Reset Selection' : '❌ ยกเลิกการเลือก', value: 'reset_selection', emoji: '🔄' },
            ...scriptKeys.map((key, index) => ({ label: isEN ? `Script ${index + 1}` : `สคริปต์ ${index + 1}`, description: key, value: key, emoji: '📜' }))
        ].slice(0, 25));
    } else { selectMenu.addOptions([{ label: 'Empty', value: 'none' }]); }

    const getButton = new ButtonBuilder()
        .setCustomId(isEN ? 'btn_get_en' : 'btn_get_th')
        .setLabel(isEN ? 'Get Script Link 🔗' : 'รับลิ้งค์สคริปต์ 🔗')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasScripts);

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), new ActionRowBuilder().addComponents(getButton)] };
}

async function generateAdminScriptPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Script Admin Control').setDescription(`📊 ในคลังมี: **${Object.keys(scriptDatabase).length}** สคริปต์`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
        new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไขสคริปต์').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    return { embeds: [embed], components: [row] };
}

// 4. Web Stats Panel
async function generateWebStatsPanel() {
    const keys = Object.keys(scriptDatabase);
    const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    let statsList = "❌ ไม่มีข้อมูล";
    if (keys.length > 0) {
        statsList = keys.map((k, i) => `> **${i+1}.** 📜 **${k}** : 👁️ \`${scriptDatabase[k].views || 0}\``).join('\n\n');
    }
    const embed = new EmbedBuilder().setColor('#FFA500').setTitle('📊 Web View Stats').setDescription(`**Update:** ${now}\n\n${statsList}`);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_refresh_stats').setLabel('รีเฟรช 🔄').setStyle(ButtonStyle.Primary));
    return { embeds: [embed], components: [row] };
}

// Update Loops
async function updateAllScriptDashboards() {
    if (activeScriptPanelEN) try { await activeScriptPanelEN.edit(await generateUserPanelPayload('en')); } catch (e) {}
    if (activeScriptPanelTH) try { await activeScriptPanelTH.edit(await generateUserPanelPayload('th')); } catch (e) {}
    if (activeAdminScriptPanel) try { await activeAdminScriptPanel.edit(await generateAdminScriptPanel()); } catch (e) {}
    if (activeWebStatsPanel) try { await activeWebStatsPanel.edit(await generateWebStatsPanel()); } catch (e) {}
}

// Status System
const STATUS_OPTIONS = [
    { label: 'Undetected - ใช้งานได้ปกติ', value: 'green', emoji: '🟢', descTH: 'ใช้งานได้ปกติ', descEN: 'Undetected' },
    { label: 'Risky - มีโอกาสโดนแบน', value: 'yellow', emoji: '🟡', descTH: 'มีโอกาสโดนแบน', descEN: 'Risky' },
    { label: 'Updating - กำลังอัปเดต', value: 'orange', emoji: '🟠', descTH: 'กำลังอัปเดต', descEN: 'Updating...' },
    { label: 'Detected - โดนตรวจจับ', value: 'red', emoji: '🔴', descTH: 'โดนตรวจจับ (รออัปเดต)', descEN: 'Detected (Wait update)' },
    { label: 'Discontinued - เลิกทำแล้ว', value: 'black', emoji: '⚫', descTH: 'เลิกทำแล้ว', descEN: 'Discontinued' }
];

async function updateStatusDashboard() { if (activeStatusPanel) try { await activeStatusPanel.edit(await generateStatusPanelPayload()); } catch (e) {} }

async function generateStatusPanelPayload() {
    const keys = Object.keys(statusDatabase);
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: true, dateStyle: 'short', timeStyle: 'short' });
    
    // รายชื่อสคริปต์พร้อมสถานะ (แก้ไขให้แสดงคำอธิบายภาษาไทยตามสั่ง)
    let list = 'No script status available.';
    if (keys.length > 0) {
        list = keys.map(k => {
            const s = statusDatabase[k];
            // แสดงผล: • 🟢 : ชื่อสคริปต์ -> ใช้งานได้ปกติ
            return `• ${s.emoji} : **${k}** —> ${s.descTH}`;
        }).join('\n');
    }

    const legend = `
🟢 Undetected - ใช้งานได้ปกติ
🟡 Risky - มีโอกาสโดนแบน
🟠 Updating... - กำลังอัปเดต
🔴 Detected (Wait new update) - โดนตรวจจับ (รออัปเดต)
⚫ Discontinued - เลิกทำแล้ว (ถ้าหากกระแสเกมนั้นๆ กลับมาดี อาจกลับไปทำ)`;

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🕐 Current Status')
        .setDescription(`**${now} (GMT+07)**\n\n⏲️ **Script Working 24/7**\n\n${list}\n\n━━━━━━━━━━━━━━━━━━━━\n${legend}`)
        .setFooter({text: 'Swift Hub Status System'});
        
    return { embeds: [embed] };
}

// --- ⚡ INTERACTIONS ---
client.on('interactionCreate', async (i) => {
    
    // Slash Commands
    if (i.isChatInputCommand()) {
        const { commandName } = i;
        if (commandName === 'getscript-en') { activeScriptPanelEN = await i.reply({ ...(await generateUserPanelPayload('en')), fetchReply: true }); panelDatabase['en'] = { channelId: i.channelId, messageId: activeScriptPanelEN.id }; await savePanelData(); }
        if (commandName === 'getscript-th') { activeScriptPanelTH = await i.reply({ ...(await generateUserPanelPayload('th')), fetchReply: true }); panelDatabase['th'] = { channelId: i.channelId, messageId: activeScriptPanelTH.id }; await savePanelData(); }
        
        if (i.user.id === OWNER_ID) {
            if (commandName === 'admin') { activeAdminScriptPanel = await i.reply({ ...(await generateAdminScriptPanel()), fetchReply: true }); panelDatabase['admin'] = { channelId: i.channelId, messageId: activeAdminScriptPanel.id }; await savePanelData(); }
            if (commandName === 'status-panel') { activeStatusPanel = await i.reply({ ...(await generateStatusPanelPayload()), fetchReply: true }); panelDatabase['status'] = { channelId: i.channelId, messageId: activeStatusPanel.id }; await savePanelData(); }
            if (commandName === 'web-stats') { activeWebStatsPanel = await i.reply({ ...(await generateWebStatsPanel()), fetchReply: true }); panelDatabase['webstats'] = { channelId: i.channelId, messageId: activeWebStatsPanel.id }; await savePanelData(); }
            if (commandName === 'status-admin') {
                const embed = new EmbedBuilder().setTitle('🔧 Status Admin Panel').setColor('#FF0000');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_st_add').setLabel('เพิ่มสถานะ').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_st_edit').setLabel('แก้ไขสถานะ').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('btn_st_delete').setLabel('ลบสถานะ').setStyle(ButtonStyle.Danger)
                );
                activeStatusAdminPanel = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            }
        } else if (['admin', 'status-panel', 'web-stats', 'status-admin'].includes(commandName)) { return i.reply({ content: '🚫 Admin only!', ephemeral: true }); }
    }

    // User Select Script (แยก Panel TH/EN)
    if (i.isStringSelectMenu() && i.customId.startsWith('select_script')) {
        const lang = i.customId.includes('en') ? 'en' : 'th';
        const storageKey = `${i.user.id}_${lang}`; // แยก Key ตามภาษา
        const val = i.values[0];

        if (val === 'reset_selection') {
            userSelections.delete(storageKey);
            return i.update(await generateUserPanelPayload(lang));
        }
        userSelections.set(storageKey, val);
        await i.reply({ content: lang === 'en' ? `✅ Selected **${val}**!` : `✅ เลือก **${val}** แล้ว!`, ephemeral: true });
    }

    // User Get Button (⚠️ ระบบป้องกัน + คูลดาวน์ + รีเซ็ต 3 วิ)
    if (i.isButton() && i.customId.startsWith('btn_get')) {
        const lang = i.customId.includes('en') ? 'en' : 'th';
        const storageKey = `${i.user.id}_${lang}`;
        const name = userSelections.get(storageKey);
        const cooldownTime = 60 * 60 * 1000; // 1 ชั่วโมง (3600000 ms)

        // 1. เช็คคูลดาวน์ (1 ชั่วโมง)
        if (i.user.id !== OWNER_ID && userCooldowns.has(i.user.id)) {
            const expiration = userCooldowns.get(i.user.id) + cooldownTime;
            if (Date.now() < expiration) {
                const timeLeft = Math.ceil((expiration - Date.now()) / 60000); // เหลืออีกกี่นาที
                const cdMsg = lang === 'en'
                    ? `⏳ **Cooldown! Please wait ${timeLeft} minutes.**`
                    : `⏳ **ใจเย็นๆ นะคะ! กรุณารออีก ${timeLeft} นาทีก่อนกดรับใหม่**`;
                
                const msg = await i.reply({ content: cdMsg, ephemeral: true });
                setTimeout(() => { i.deleteReply().catch(()=>{}) }, 4000); // ลบใน 4 วิ
                return;
            }
        }

        // 2. เช็คว่าเลือกสคริปต์หรือยัง
        if (!name || !scriptDatabase[name]) {
            const warningMsg = lang === 'en'
                ? '⚠️ **Please select a script from the menu first!**' 
                : '⚠️ **กรุณาเลือกสคริปต์จากเมนูด้านบนก่อนกดปุ่มรับสคริปต์นะคะ!**';
            
            const msg = await i.reply({ content: warningMsg, ephemeral: true });
            setTimeout(() => { i.deleteReply().catch(()=>{}) }, 5000); // ลบใน 5 วิ
            return; 
        }
        
        // 3. ส่งลิ้งค์ (สำเร็จ)
        const webLink = `https://${DOMAIN}/view/${encodeURIComponent(name)}?lang=${lang}`;
        const embed = new EmbedBuilder().setColor('#00FF00')
            .setTitle(lang === 'en' ? `🔗 Link Ready: ${name}` : `🔗 ลิ้งค์สคริปต์พร้อมแล้ว: ${name}`)
            .setDescription(lang === 'en' ? `👇 **Click the button below to view and copy the script.**\n\n*Enjoy using Swift Hub!* 🎮` : `👇 **คลิกปุ่มด้านล่างเพื่อไปหน้าเว็บไซต์และคัดลอกสคริปต์นะคะ**\n\n*ขอให้สนุกกับการใช้งาน Swift Hub ค่ะ* 🎮`)
            .setFooter({ text: 'Swift Hub Service ❤️' });

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(lang === 'en' ? 'Open Script Page 🌐' : 'เปิดหน้าสคริปต์ 🌐').setStyle(ButtonStyle.Link).setURL(webLink));
        await i.reply({ embeds: [embed], components: [row], ephemeral: true });

        // 4. บันทึกคูลดาวน์
        userCooldowns.set(i.user.id, Date.now());

        // 5. รีเซ็ตการเลือกใน 3 วินาที (ป้องกันกดซ้ำมั่วๆ)
        setTimeout(async () => {
            userSelections.delete(storageKey);
            // อัปเดต Panel เพื่อให้ Dropdown กลับเป็นค่าเริ่มต้น
            // (Optional: ถ้าอยากให้ Dropdown เด้งกลับทันทีต้องใช้ i.message.edit แต่มันอาจจะกวน User อื่น ดังนั้นเราลบแค่ใน Server Memory พอ)
        }, 3000);
    }

    // --- ADMIN ACTIONS (Owner Only) ---
    if (i.user.id !== OWNER_ID && (i.customId.startsWith('btn_') || i.customId.startsWith('menu_') || i.customId.startsWith('modal_'))) return;

    if (i.customId === 'btn_refresh_stats') await i.update(await generateWebStatsPanel());

    // Add Script
    if (i.customId === 'btn_add') {
        const m = new ModalBuilder().setCustomId('modal_add').setTitle('เติมสคริปต์ใหม่');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_img').setLabel("ลิ้งค์รูปภาพ").setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await i.showModal(m);
    }
    if (i.customId === 'modal_add' && i.isModalSubmit()) {
        const name = i.fields.getTextInputValue('inp_name');
        scriptDatabase[name] = { code: i.fields.getTextInputValue('inp_code'), image: i.fields.getTextInputValue('inp_img') || DEFAULT_IMG, views: 0 };
        await saveScriptData(); await i.reply({ content: `✅ เพิ่มสคริปต์ **${name}** แล้ว!`, ephemeral: true });
    }

    // Check Script
    if (i.customId === 'btn_check') {
        const keys = Object.keys(scriptDatabase);
        if (keys.length === 0) return i.reply({ content: '❌ คลังว่างเปล่า!', ephemeral: true });
        let msg = "**📜 รายชื่อสคริปต์:**\n" + keys.map((k, idx) => `${idx+1}. **${k}** (👁️ ${scriptDatabase[k].views})`).join('\n');
        await i.reply({ content: msg, ephemeral: true });
    }

    // Edit Script
    if (i.customId === 'btn_edit') {
        const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (!opts.length) return i.reply({ content: '❌ ไม่มีสคริปต์ให้แก้ไข', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_edit_select').setPlaceholder('เลือกสคริปต์...').addOptions(opts));
        await i.reply({ content: '🛠️ เลือกสคริปต์ที่จะแก้ไข:', components: [row], ephemeral: true });
    }
    if (i.customId === 'menu_edit_select' && i.isStringSelectMenu()) {
        activeEditTarget = i.values[0];
        const oldData = scriptDatabase[activeEditTarget];
        const m = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${activeEditTarget}`);
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_img').setLabel("รูปใหม่").setStyle(TextInputStyle.Short).setValue(oldData.image || '').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_code').setLabel("โค้ดใหม่").setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await i.showModal(m);
    }
    if (i.customId === 'modal_edit_save' && i.isModalSubmit()) {
        if (activeEditTarget && scriptDatabase[activeEditTarget]) {
            scriptDatabase[activeEditTarget].code = i.fields.getTextInputValue('inp_new_code');
            scriptDatabase[activeEditTarget].image = i.fields.getTextInputValue('inp_new_img') || DEFAULT_IMG;
            await saveScriptData(); await i.reply({ content: `✅ แก้ไข **${activeEditTarget}** เรียบร้อย!`, ephemeral: true });
        }
    }

    // Delete Script
    if (i.customId === 'btn_delete') {
        const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (!opts.length) return i.reply({ content: '❌ คลังว่าง', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกที่จะลบ...').addOptions(opts));
        await i.reply({ content: '🗑️ เลือกสคริปต์ที่จะลบ:', components: [row], ephemeral: true });
    }
    if (i.customId === 'menu_delete' && i.isStringSelectMenu()) {
        delete scriptDatabase[i.values[0]]; await saveScriptData(); await i.reply({ content: `🗑️ ลบ **${i.values[0]}** แล้ว!`, ephemeral: true });
    }

    // --- STATUS ADMIN LOGIC (New & Improved) ---
    
    // ➕ Add Status (ใช้ Dropdown แทนการพิมพ์ชื่อ)
    if (i.customId === 'btn_st_add') {
        const scriptNames = Object.keys(scriptDatabase);
        if (scriptNames.length === 0) return i.reply({ content: '❌ ยังไม่มีสคริปต์ในคลังให้เพิ่มสถานะค่ะ', ephemeral: true });
        
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('menu_st_add_name')
                .setPlaceholder('เลือกสคริปต์ที่จะเพิ่มสถานะ...')
                .addOptions(scriptNames.map(k => ({ label: k, value: k })).slice(0, 25))
        );
        await i.reply({ content: '📝 เลือกสคริปต์ที่ต้องการตั้งสถานะ:', components: [row], ephemeral: true });
    }

    if (i.customId === 'menu_st_add_name') {
        tempStatusName = i.values[0];
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_sel').setPlaceholder('เลือกสถานะ...').addOptions(STATUS_OPTIONS));
        await i.update({ content: `กำลังตั้งสถานะให้: **${tempStatusName}**\n👇 เลือกสถานะด้านล่าง:`, components: [row] });
    }

    if (i.customId === 'menu_st_sel') {
        const s = STATUS_OPTIONS.find(o=>o.value===i.values[0]);
        statusDatabase[tempStatusName] = { emoji: s.emoji, descTH: s.descTH, descEN: s.descEN };
        await saveStatusData(); await i.update({ content: `✅ บันทึกสถานะ **${tempStatusName}** เป็น ${s.emoji} เรียบร้อย!`, components: [] });
    }

    // ✏️ Edit Status (ใช้ Dropdown)
    if (i.customId === 'btn_st_edit') {
        const keys = Object.keys(statusDatabase);
        if (!keys.length) return i.reply({ content: '❌ ยังไม่มีสถานะสคริปต์ให้แก้ไข', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_edit_key').setPlaceholder('เลือกสคริปต์ที่จะแก้สถานะ...').addOptions(keys.map(k=>({label:k, value:k})).slice(0,25)));
        await i.reply({ content: '📝 เลือกสคริปต์ที่ต้องการเปลี่ยนสถานะ:', components: [row], ephemeral: true });
    }
    if (i.customId === 'menu_st_edit_key') {
        tempStatusName = i.values[0];
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_sel').setPlaceholder('เลือกสถานะใหม่...').addOptions(STATUS_OPTIONS));
        await i.update({ content: `กำลังแก้ไขสถานะของ: **${tempStatusName}**\n👇 เลือกสถานะใหม่ด้านล่าง:`, components: [row] });
    }

    // 🗑️ Delete Status
    if (i.customId === 'btn_st_delete') {
        const keys = Object.keys(statusDatabase);
        if (!keys.length) return i.reply({ content: '❌ ว่างเปล่า', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_del').setPlaceholder('เลือกที่จะลบ...').addOptions(keys.map(k=>({label:k, value:k})).slice(0,25)));
        await i.reply({ content: '🗑️ เลือกสถานะที่จะลบ:', components: [row], ephemeral: true });
    }
    if (i.customId === 'menu_st_del') {
        delete statusDatabase[i.values[0]]; await saveStatusData(); await i.reply({ content: '🗑️ ลบสถานะเรียบร้อย', ephemeral: true });
    }
});

client.login(TOKEN);
