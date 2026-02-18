const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
require('dotenv').config();

// --- ⚙️ ตั้งค่า (CONFIG) ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

// ระบบจัดการโดเมนอัตโนมัติ
let rawDomain = process.env.PUBLIC_DOMAIN || '';
rawDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
const DOMAIN = rawDomain || 'wift-script-manager-bot-production.up.railway.app'; 

const SCRIPT_DB_FILE = './scripts.json';
const STATUS_DB_FILE = './status.json';
const DEFAULT_IMG = 'https://cdn.discordapp.com/attachments/1449112368977281117/1473691141802299475/IMG_0939.png'; 

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const app = express();

// --- 🌐 ระบบเว็บไซต์ (Web Server) ---
app.get('/', (req, res) => {
    res.send('<h1 style="color:green; font-family:sans-serif; text-align:center; margin-top:20%;">🤖 Swift Script Hub is Running!</h1>');
});

app.get('/view/:key', (req, res) => {
    const key = req.params.key;
    const lang = req.query.lang || 'th';
    const scriptData = scriptDatabase[key];

    if (!scriptData) return res.status(404).send('<h1 style="color:red; text-align:center;">404 - ไม่พบสคริปต์</h1>');

    const code = typeof scriptData === 'string' ? scriptData : scriptData.code;
    const img = (typeof scriptData === 'object' && scriptData.image) ? scriptData.image : DEFAULT_IMG;

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
        if (err) return res.status(500).send('Error loading index.html from GitHub');
        
        let finalHtml = html
            .replace('{{IMAGE_URL}}', img)
            .replace('{{SCRIPT_NAME}}', key)
            .replace('{{SCRIPT_CODE}}', code)
            .replace('{{COPY_BTN}}', data.copyBtn)
            .replace('{{WARNING_TEXT}}', data.warning)
            .replace('{{MENU_CONTACT}}', data.menuContact)
            .replace('{{DISCORD_DESC}}', data.discordDesc)
            .replace('{{COPY_LINK_BTN}}', data.copyLinkBtn)
            .replace('{{COPIED_TEXT}}', data.copiedText);

        res.send(finalHtml);
    });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Website online on port ${PORT}`));

// --- 📂 ฐานข้อมูล ---
let scriptDatabase = {};
let statusDatabase = {}; 
let userSelections = new Map(); 
let activeEditTarget = null;
let tempStatusName = null; 

let activeScriptPanelEN = null, activeScriptPanelTH = null, activeAdminScriptPanel = null;
let activeStatusPanel = null, activeStatusAdminPanel = null;

function loadData() {
    if (fs.existsSync(SCRIPT_DB_FILE)) { try { scriptDatabase = JSON.parse(fs.readFileSync(SCRIPT_DB_FILE, 'utf8')); } catch (e) { scriptDatabase = {}; } }
    if (fs.existsSync(STATUS_DB_FILE)) { try { statusDatabase = JSON.parse(fs.readFileSync(STATUS_DB_FILE, 'utf8')); } catch (e) { statusDatabase = {}; } }
}
loadData();

async function saveScriptData() { fs.writeFileSync(SCRIPT_DB_FILE, JSON.stringify(scriptDatabase, null, 4)); await updateAllScriptDashboards(); }
async function saveStatusData() { fs.writeFileSync(STATUS_DB_FILE, JSON.stringify(statusDatabase, null, 4)); await updateStatusDashboard(); }

// --- 🔥 ลงทะเบียนคำสั่ง ---
const commands = [
    new SlashCommandBuilder().setName('admin').setDescription('🔧 จัดการคลังสคริปต์ (Admin Only)'),
    new SlashCommandBuilder().setName('status-admin').setDescription('🔧 จัดการสถานะสคริปต์ (Admin Only)'),
    new SlashCommandBuilder().setName('getscript-en').setDescription('🇺🇸 Create Script Panel (English)'),
    new SlashCommandBuilder().setName('getscript-th').setDescription('🇹🇭 สร้างหน้าต่างรับสคริปต์ (ภาษาไทย)'),
    new SlashCommandBuilder().setName('status-panel').setDescription('📊 สร้างหน้าสถานะสคริปต์'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`น้องปาย Swift Hub พร้อมทำงานแล้วค่ะ! Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (error) { console.error(error); }
});

// --- 🎨 ฟังก์ชั่นสร้าง Panel ---
async function generateUserPanelPayload(lang) {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;
    const isEN = lang === 'en';

    const embed = new EmbedBuilder()
        .setColor(hasScripts ? '#0099ff' : '#808080')
        .setTitle('📂 Swift Script Hub Service')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Powered by Pai ❤️ | Select script & Click button' });
    
    if (hasScripts) {
        const list = scriptKeys.map((k, i) => isEN ? `> **Script ${i + 1}** : ${k}` : `> **สคริปต์ ${i + 1}** : ${k}`).join('\n');
        embed.setDescription(isEN 
            ? `**Thank you for using Swift Hub!** ❤️\n----------------------------------------------------\n**📜 Available Scripts (${scriptKeys.length}):**\n${list}\n\n*Select a script and click button below.*`
            : `**ขอบคุณที่ไว้ใจใช้บริการ Swift Hub นะคะ** ❤️\n----------------------------------------------------\n**📜 สคริปต์ที่พร้อมใช้งาน (${scriptKeys.length}):**\n${list}\n\n*เลือกสคริปต์แล้วกดปุ่มรับลิ้งค์นะคะ*`);
    } else {
        embed.setDescription('❌ **Out of Stock / คลังว่างเปล่า**');
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(isEN ? 'select_script_en' : 'select_script_th')
        .setPlaceholder(hasScripts ? '🔻 Select your script...' : '⛔ Empty')
        .setDisabled(!hasScripts);

    if (hasScripts) {
        selectMenu.addOptions([
            { label: isEN ? '❌ Reset Selection' : '❌ ยกเลิกการเลือก', value: 'reset_selection', emoji: '🔄' },
            ...scriptKeys.map((key, index) => ({ 
                label: isEN ? `Script ${index + 1}` : `สคริปต์ ${index + 1}`, 
                description: key, 
                value: key, 
                emoji: '📜' 
            }))
        ].slice(0, 25));
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none' }]);
    }

    const getButton = new ButtonBuilder()
        .setCustomId(isEN ? 'btn_get_en' : 'btn_get_th')
        .setLabel(isEN ? 'Get Script Link 🔗' : 'รับลิ้งค์สคริปต์ 🔗')
        .setStyle(ButtonStyle.Success);

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), new ActionRowBuilder().addComponents(getButton)] };
}

async function generateAdminScriptPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Script Admin Control Panel').setDescription(`📊 ในคลังมีทั้งหมด: **${Object.keys(scriptDatabase).length}** สคริปต์`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
        new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไข').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    return { embeds: [embed], components: [row] };
}

async function updateAllScriptDashboards() {
    if (activeScriptPanelEN) try { await activeScriptPanelEN.edit(await generateUserPanelPayload('en')); } catch (e) {}
    if (activeScriptPanelTH) try { await activeScriptPanelTH.edit(await generateUserPanelPayload('th')); } catch (e) {}
    if (activeAdminScriptPanel) try { await activeAdminScriptPanel.edit(await generateAdminScriptPanel()); } catch (e) {}
}

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
    let list = keys.length > 0 ? keys.map(k => `• ${statusDatabase[k].emoji} : **${k}**\n   🇺🇸 ${statusDatabase[k].descEN}\n   🇹🇭 ${statusDatabase[k].descTH}`).join('\n\n') : 'No script status.';
    const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🕐 Current Status').setDescription(list);
    return { embeds: [embed] };
}

// --- ⚡ จัดการการโต้ตอบ (Interactions) ---
client.on('interactionCreate', async (i) => {
    if (i.isChatInputCommand()) {
        const { commandName } = i;
        if (commandName === 'getscript-en') activeScriptPanelEN = await i.reply({ ...(await generateUserPanelPayload('en')), fetchReply: true });
        if (commandName === 'getscript-th') activeScriptPanelTH = await i.reply({ ...(await generateUserPanelPayload('th')), fetchReply: true });
        if (commandName === 'admin' && i.user.id === OWNER_ID) activeAdminScriptPanel = await i.reply({ ...(await generateAdminScriptPanel()), fetchReply: true });
        if (commandName === 'status-panel' && i.user.id === OWNER_ID) activeStatusPanel = await i.reply({ ...(await generateStatusPanelPayload()), fetchReply: true });
        if (commandName === 'status-admin' && i.user.id === OWNER_ID) {
            const embed = new EmbedBuilder().setTitle('🔧 Status Admin Panel').setColor('#FF0000');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_st_add').setLabel('เพิ่มสถานะ').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_st_edit').setLabel('แก้ไขสถานะ').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('btn_st_delete').setLabel('ลบสถานะ').setStyle(ButtonStyle.Danger)
            );
            activeStatusAdminPanel = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
        }
    }

    if (i.isStringSelectMenu() && i.customId.startsWith('select_script')) {
        const val = i.values[0];
        if (val === 'reset_selection') {
            userSelections.delete(i.user.id);
            return i.update(await generateUserPanelPayload(i.customId.includes('en') ? 'en' : 'th'));
        }
        userSelections.set(i.user.id, val);
        await i.reply({ content: `✅ คุณเลือก **${val}** แล้ว!`, ephemeral: true });
    }

    if (i.isButton() && i.customId.startsWith('btn_get')) {
        const name = userSelections.get(i.user.id);
        if (!name || !scriptDatabase[name]) return i.reply({ content: '⚠️ กรุณาเลือกสคริปต์ก่อนค่ะ!', ephemeral: true });
        
        const isEN = i.customId.includes('en');
        const webLink = `https://${DOMAIN}/view/${encodeURIComponent(name)}?lang=${isEN ? 'en' : 'th'}`;
        
        const embed = new EmbedBuilder().setColor('#00FF00')
            .setTitle(isEN ? `🔗 Link Ready: ${name}` : `🔗 ลิ้งค์สคริปต์พร้อมแล้ว: ${name}`)
            .setDescription(isEN ? 'Click button below to view and copy script.' : 'คลิกปุ่มด้านล่างเพื่อไปหน้าเว็บไซต์และคัดลอกสคริปต์นะคะ')
            .setFooter({ text: 'Swift Hub Service ❤️' });

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(isEN ? 'Open Page' : 'เปิดหน้าสคริปต์').setStyle(ButtonStyle.Link).setURL(webLink).setEmoji('🌐'));
        await i.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // Owner Only Logic
    if (i.user.id !== OWNER_ID) return;

    if (i.customId === 'btn_add') {
        const m = new ModalBuilder().setCustomId('modal_add').setTitle('เติมสคริปต์ใหม่');
        m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_img').setLabel("ลิ้งค์รูปภาพ").setStyle(TextInputStyle.Short).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        await i.showModal(m);
    }

    if (i.customId === 'modal_add' && i.isModalSubmit()) {
        const name = i.fields.getTextInputValue('inp_name');
        scriptDatabase[name] = { 
            code: i.fields.getTextInputValue('inp_code'), 
            image: i.fields.getTextInputValue('inp_img') || DEFAULT_IMG 
        };
        await saveScriptData();
        await i.reply({ content: `✅ เพิ่มสคริปต์ **${name}** เรียบร้อย!`, ephemeral: true });
    }

    if (i.customId === 'btn_st_add') {
        const m = new ModalBuilder().setCustomId('modal_st_name').setTitle('เพิ่มสถานะสคริปต์');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_st_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)));
        await i.showModal(m);
    }

    if (i.customId === 'modal_st_name' && i.isModalSubmit()) {
        tempStatusName = i.fields.getTextInputValue('inp_st_name');
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_select_status').setPlaceholder('เลือกสถานะ...').addOptions(STATUS_OPTIONS));
        await i.reply({ content: `เลือกสถานะสำหรับ **${tempStatusName}**:`, components: [row], ephemeral: true });
    }

    if (i.customId === 'menu_st_select_status' && i.isStringSelectMenu()) {
        const s = STATUS_OPTIONS.find(o => o.value === i.values[0]);
        if (tempStatusName && s) {
            statusDatabase[tempStatusName] = { emoji: s.emoji, descTH: s.descTH, descEN: s.descEN };
            await saveStatusData();
            await i.reply({ content: `✅ เพิ่มสถานะของ **${tempStatusName}** เรียบร้อย!`, ephemeral: true });
        }
    }

    // ลบ/แก้ไข สคริปต์
    if (i.customId === 'btn_delete') {
        const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (!opts.length) return i.reply({ content: 'คลังว่างเปล่า!', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวที่จะลบ...').addOptions(opts));
        await i.reply({ content: 'ต้องการลบสคริปต์ไหนคะ:', components: [row], ephemeral: true });
    }

    if (i.customId === 'menu_delete' && i.isStringSelectMenu()) {
        const name = i.values[0];
        delete scriptDatabase[name];
        await saveScriptData();
        await i.reply({ content: `🗑️ ลบ **${name}** เรียบร้อย!`, ephemeral: true });
    }
});

client.login(TOKEN);
