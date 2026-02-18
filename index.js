const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
require('dotenv').config();

// --- ⚙️ CONFIG (ฉบับอัจฉริยะ) ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PORT = process.env.PORT || 3000;

// 🧠 ระบบจัดการโดเมน: ตัด https:// ออกอัตโนมัติ และแก้คำผิด WIFT/SWIFT ให้ (ถ้าจำเป็น)
let rawDomain = process.env.PUBLIC_DOMAIN || '';
// ลบ https://, http:// และ / ตัวท้ายออก
rawDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
// ถ้าไม่มีค่า ให้ใช้ค่า default (ต้องแก้ให้ตรงกับชื่อโปรเจกต์จริงใน Railway)
const DOMAIN = rawDomain || 'wift-script-manager-bot-production.up.railway.app'; 

const SCRIPT_DB_FILE = './scripts.json';
const STATUS_DB_FILE = './status.json';
const DEFAULT_IMG = 'https://media.discordapp.net/attachments/123456789/placeholder.png'; 

// --- 🤖 CLIENT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// --- 🌐 WEB SERVER ---
const app = express();

// Route: หน้าแรก (Check Status)
app.get('/', (req, res) => {
    res.send('<h1 style="color:green; font-family:sans-serif; text-align:center; margin-top:20%;">🤖 Bot & Website is Running!</h1>');
});

// Route: ดูสคริปต์ (อ่านจากไฟล์ index.html ใน GitHub)
app.get('/view/:key', (req, res) => {
    const key = req.params.key;
    const lang = req.query.lang || 'th';
    const scriptData = scriptDatabase[key];

    if (!scriptData) return res.status(404).send('<h1 style="color:red; text-align:center;">404 - Script Not Found / ไม่พบสคริปต์</h1>');

    const code = typeof scriptData === 'string' ? scriptData : scriptData.code;
    const img = (typeof scriptData === 'object' && scriptData.image) ? scriptData.image : DEFAULT_IMG;

    const isEN = lang === 'en';
    const copyBtn = isEN ? 'COPY SCRIPT' : 'คัดลอกสคริปต์';
    const warning = isEN ? '⚠️ Use at your own risk. Play safe!' : '⚠️ การใช้งานมีความเสี่ยง โปรดเล่นอย่างระมัดระวัง';

    // 📂 อ่านไฟล์ index.html ที่ซีม่อนสร้างไว้ใน GitHub
    const htmlPath = path.join(__dirname, 'index.html');
    
    // ถ้าหาไฟล์ index.html ไม่เจอ ให้สร้างหน้าเว็บสำรอง (Backup)
    if (!fs.existsSync(htmlPath)) {
        return res.send(`
            <html><body style="background:#111;color:#fff;text-align:center;padding:50px;font-family:sans-serif;">
            <h1>⚠️ ไม่พบไฟล์ index.html</h1>
            <p>กรุณาสร้างไฟล์ index.html ใน GitHub ด้วยนะคะ</p>
            <textarea style="width:80%;height:300px;background:#222;color:#0f0;border:none;padding:10px;">${code}</textarea>
            </body></html>
        `);
    }

    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) return res.status(500).send('Error loading template');
        let finalHtml = html
            .replace('{{IMAGE_URL}}', img)
            .replace('{{SCRIPT_NAME}}', key)
            .replace('{{SCRIPT_CODE}}', code)
            .replace('{{COPY_BTN}}', copyBtn)
            .replace('{{WARNING_TEXT}}', warning);
        res.send(finalHtml);
    });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Website running on port ${PORT}`));

// --- 📂 DATABASE ---
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

async function saveScriptData() {
    fs.writeFileSync(SCRIPT_DB_FILE, JSON.stringify(scriptDatabase, null, 4));
    await updateAllScriptDashboards(); 
}
async function saveStatusData() {
    fs.writeFileSync(STATUS_DB_FILE, JSON.stringify(statusDatabase, null, 4));
    await updateStatusDashboard();
}

// --- 🔥 COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('admin').setDescription('🔧 Script Admin Panel'),
    new SlashCommandBuilder().setName('status-admin').setDescription('🔧 Status Admin Panel'),
    new SlashCommandBuilder().setName('getscript-en').setDescription('🇺🇸 Script Panel (EN)'),
    new SlashCommandBuilder().setName('getscript-th').setDescription('🇹🇭 Script Panel (TH)'),
    new SlashCommandBuilder().setName('status-panel').setDescription('📊 Status Dashboard'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`น้องปาย Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (error) { console.error(error); }
});

// --- HELPER FUNCTIONS ---
async function generateUserPanelPayload(lang) {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;
    const isEN = lang === 'en';
    const title = '📂 Swift Script Hub';
    const footer = 'Powered by Pai ❤️ | Select script & Click button';
    
    let description = '';
    if (hasScripts) {
        const list = scriptKeys.map((k, i) => isEN ? `> **Script ${i + 1}** : ${k}` : `> **สคริปต์ ${i + 1}** : ${k}`).join('\n');
        description = isEN 
            ? `**Thank you for using Swift Hub!** ❤️\nWe provide high-quality scripts just for you.\n\n⚠️ **Warning:** Using scripts involves risk. Please play responsibly.\n----------------------------------------------------\n**📜 Available Scripts (${scriptKeys.length}):**\n${list}\n\n*Select a script below and click "Get Script Link".*`
            : `**ขอบคุณที่ไว้ใจใช้บริการ Swift Hub นะคะ** ❤️\nเราคัดสรรสคริปต์คุณภาพมาเพื่อคุณโดยเฉพาะ\n\n⚠️ **คำเตือน:** การใช้สคริปต์มีความเสี่ยง โปรดเล่นอย่างมีสติ\n----------------------------------------------------\n**📜 สคริปต์ที่พร้อมใช้งาน (${scriptKeys.length}):**\n${list}\n\n*เลือกสคริปต์จากเมนูด้านล่าง แล้วกดปุ่ม "รับลิ้งค์สคริปต์" นะคะ*`;
    } else {
        description = isEN ? '❌ **Out of Stock**' : '❌ **คลังว่างเปล่า**';
    }

    const embed = new EmbedBuilder().setColor(hasScripts ? '#0099ff' : '#808080').setTitle(title).setDescription(description).setThumbnail(client.user.displayAvatarURL()).setFooter({ text: footer });
    const selectMenu = new StringSelectMenuBuilder().setCustomId(isEN ? 'select_script_en' : 'select_script_th').setPlaceholder(hasScripts ? (isEN ? '🔻 Select script...' : '🔻 เลือกสคริปต์...') : '⛔ Empty').setDisabled(!hasScripts);

    if (hasScripts) {
        selectMenu.addOptions([
            { label: isEN ? '❌ Reset Selection' : '❌ ยกเลิกการเลือก', value: 'reset_selection', emoji: '🔄' },
            ...scriptKeys.map((key, index) => ({ label: isEN ? `Script ${index + 1}` : `สคริปต์ ${index + 1}`, description: key.substring(0, 100), value: key, emoji: '📜' }))
        ].slice(0, 25));
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none' }]);
    }

    const getButton = new ButtonBuilder().setCustomId(isEN ? 'btn_get_en' : 'btn_get_th').setLabel(isEN ? 'Get Script Link 🔗' : 'รับลิ้งค์สคริปต์ 🔗').setStyle(ButtonStyle.Success).setDisabled(!hasScripts);
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), new ActionRowBuilder().addComponents(getButton)] };
}

async function generateAdminScriptPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Script Admin Control').setDescription(`**จัดการคลังสคริปต์ (Web System)**\n\n📊 มีทั้งหมด: **${Object.keys(scriptDatabase).length}** สคริปต์`).setThumbnail(client.user.displayAvatarURL());
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
        new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไข').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    return { embeds: [embed], components: [row] };
}

async function updateAllScriptDashboards() {
    if (activeScriptPanelEN) try { await activeScriptPanelEN.edit(await generateUserPanelPayload('en')); } catch (e) { activeScriptPanelEN = null; }
    if (activeScriptPanelTH) try { await activeScriptPanelTH.edit(await generateUserPanelPayload('th')); } catch (e) { activeScriptPanelTH = null; }
    if (activeAdminScriptPanel) try { await activeAdminScriptPanel.edit(await generateAdminScriptPanel()); } catch (e) { activeAdminScriptPanel = null; }
}

const STATUS_OPTIONS = [
    { label: 'Undetected - ใช้งานได้ปกติ', value: 'green', emoji: '🟢', descTH: 'ใช้งานได้ปกติ', descEN: 'Undetected' },
    { label: 'Risky - มีโอกาสโดนแบน', value: 'yellow', emoji: '🟡', descTH: 'มีโอกาสโดนแบน', descEN: 'Risky' },
    { label: 'Updating - กำลังอัปเดต', value: 'orange', emoji: '🟠', descTH: 'กำลังอัปเดต', descEN: 'Updating...' },
    { label: 'Detected - โดนตรวจจับ', value: 'red', emoji: '🔴', descTH: 'โดนตรวจจับ (รออัปเดต)', descEN: 'Detected (Wait update)' },
    { label: 'Discontinued - เลิกทำแล้ว', value: 'black', emoji: '⚫', descTH: 'เลิกทำแล้ว', descEN: 'Discontinued' }
];

async function generateStatusPanelPayload() {
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: true, dateStyle: 'short', timeStyle: 'short' });
    const keys = Object.keys(statusDatabase);
    let statusList = keys.length > 0 ? keys.map(k => { const i = statusDatabase[k]; return `• ${i.emoji} : **${k}**\n   🇺🇸 ${i.descEN}\n   🇹🇭 ${i.descTH}`; }).join('\n\n') : 'No status available.';
    const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🕐 Current Status').setDescription(`**${now} (GMT+07)**\n\n⏲️ **Script Working 24/7**\n\n${statusList}`).setFooter({ text: 'Swift Hub Status System', iconURL: client.user.displayAvatarURL() });
    const legendEmbed = new EmbedBuilder().setColor('#202225').setDescription('🟢 Undetected  🟡 Risky  🟠 Updating...  🔴 Detected  ⚫ Discontinued');
    return { embeds: [embed, legendEmbed] };
}

async function generateStatusAdminPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Status Admin Panel').setThumbnail(client.user.displayAvatarURL());
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_st_add').setLabel('เพิ่มสถานะ').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_st_edit').setLabel('แก้ไขสถานะ').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_st_delete').setLabel('ลบสถานะ').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    return { embeds: [embed], components: [row] };
}

async function updateStatusDashboard() {
    if (activeStatusPanel) try { await activeStatusPanel.edit(await generateStatusPanelPayload()); } catch (e) { activeStatusPanel = null; }
}

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'getscript-en') activeScriptPanelEN = await interaction.reply({ ...(await generateUserPanelPayload('en')), fetchReply: true });
        if (commandName === 'getscript-th') activeScriptPanelTH = await interaction.reply({ ...(await generateUserPanelPayload('th')), fetchReply: true });
        if (commandName === 'admin') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeAdminScriptPanel = await interaction.reply({ ...(await generateAdminScriptPanel()), fetchReply: true }); }
        if (commandName === 'status-panel') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeStatusPanel = await interaction.reply({ ...(await generateStatusPanelPayload()), fetchReply: true }); }
        if (commandName === 'status-admin') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeStatusAdminPanel = await interaction.reply({ ...(await generateStatusAdminPanel()), fetchReply: true }); }
    }

    if ((interaction.customId === 'select_script_en' || interaction.customId === 'select_script_th') && interaction.isStringSelectMenu()) {
        if (interaction.values[0] === 'reset_selection') { userSelections.delete(interaction.user.id); return interaction.update(await generateUserPanelPayload(interaction.customId.includes('_en') ? 'en' : 'th')); }
        userSelections.set(interaction.user.id, interaction.values[0]);
        await interaction.reply({ content: interaction.customId.includes('_en') ? `✅ Selected **${interaction.values[0]}**!` : `✅ เลือก **${interaction.values[0]}** แล้ว!`, ephemeral: true });
    }

    if ((interaction.customId === 'btn_get_en' || interaction.customId === 'btn_get_th') && interaction.isButton()) {
        const name = userSelections.get(interaction.user.id);
        if (!name || !scriptDatabase[name]) return interaction.reply({ content: '⚠️ Please select a script first!', ephemeral: true });
        
        const isEN = interaction.customId.includes('_en');
        // ใช้ DOMAIN ที่ผ่านการกรองแล้ว
        const webLink = `https://${DOMAIN}/view/${encodeURIComponent(name)}?lang=${isEN ? 'en' : 'th'}`;

        const embed = new EmbedBuilder().setColor('#00FF00')
            .setTitle(isEN ? `🔗 Script Ready: ${name}` : `🔗 สคริปต์พร้อมแล้ว: ${name}`)
            .setDescription(isEN ? `Click the link below to view/copy script.` : `คลิกลิ้งค์ด้านล่างเพื่อดูและคัดลอกสคริปต์ค่ะ`)
            .addFields({ name: isEN ? 'Web Link:' : 'ลิ้งค์หน้าเว็บ:', value: `[👉 Click Here / กดที่นี่](${webLink})` })
            .setFooter({ text: 'Swift Hub', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(isEN ? 'Open Link' : 'เปิดหน้าสคริปต์').setStyle(ButtonStyle.Link).setURL(webLink).setEmoji('🌐'));
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (['btn_add', 'btn_edit', 'btn_delete', 'btn_check'].includes(interaction.customId) && interaction.user.id === OWNER_ID) {
        if (interaction.customId === 'btn_check') await interaction.reply({ content: `**Scripts:**\n\`\`\`\n${Object.keys(scriptDatabase).join('\n') || 'Empty'}\n\`\`\``, ephemeral: true });
        if (interaction.customId === 'btn_add') {
            const m = new ModalBuilder().setCustomId('modal_add').setTitle('Add Script');
            m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_name').setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_img').setLabel("Image URL (Optional)").setStyle(TextInputStyle.Short).setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_code').setLabel("Code").setStyle(TextInputStyle.Paragraph).setRequired(true)));
            await interaction.showModal(m);
        }
        if (interaction.customId === 'btn_edit' || interaction.customId === 'btn_delete') {
            const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (!opts.length) return interaction.reply({ content: 'Empty', ephemeral: true });
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(interaction.customId === 'btn_edit' ? 'menu_edit' : 'menu_delete').setPlaceholder('Select...').addOptions(opts));
            await interaction.reply({ content: 'Select script:', components: [row], ephemeral: true });
        }
    }
    if (interaction.customId === 'modal_add' && interaction.isModalSubmit()) {
        const name = interaction.fields.getTextInputValue('inp_name');
        scriptDatabase[name] = { code: interaction.fields.getTextInputValue('inp_code'), image: interaction.fields.getTextInputValue('inp_img') || DEFAULT_IMG };
        await saveScriptData(); await interaction.reply({ content: `✅ Added **${name}**`, ephemeral: true });
    }
    if (interaction.customId === 'menu_edit' && interaction.isStringSelectMenu()) {
        activeEditTarget = interaction.values[0];
        const old = scriptDatabase[activeEditTarget];
        const m = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`Edit: ${activeEditTarget}`);
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_img').setLabel("Image URL").setStyle(TextInputStyle.Short).setValue(old.image || '').setRequired(false)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_code').setLabel("Code").setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await interaction.showModal(m);
    }
    if (interaction.customId === 'modal_edit_save' && interaction.isModalSubmit()) {
        if(activeEditTarget) { scriptDatabase[activeEditTarget] = { code: interaction.fields.getTextInputValue('inp_new_code'), image: interaction.fields.getTextInputValue('inp_new_img') || DEFAULT_IMG }; await saveScriptData(); await interaction.reply({ content: '✨ Updated', ephemeral: true }); }
    }
    if (interaction.customId === 'menu_delete' && interaction.isStringSelectMenu()) { delete scriptDatabase[interaction.values[0]]; await saveScriptData(); await interaction.reply({ content: '🗑️ Deleted', ephemeral: true }); }

    if (['btn_st_add', 'btn_st_edit', 'btn_st_delete'].includes(interaction.customId)) {
        if (interaction.customId === 'btn_st_add') { const m = new ModalBuilder().setCustomId('modal_st_name').setTitle('Add Status'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_st_name').setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true))); await interaction.showModal(m); }
        else {
            const keys = Object.keys(statusDatabase);
            if(!keys.length) return interaction.reply({content:'Empty', ephemeral:true});
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(interaction.customId === 'btn_st_edit' ? 'menu_st_edit_select' : 'menu_st_delete').setPlaceholder('Select...').addOptions(keys.map(k=>({label:k,value:k})).slice(0,25)));
            await interaction.reply({content:'Select:', components:[row], ephemeral:true});
        }
    }
    if (interaction.customId === 'modal_st_name') { tempStatusName = interaction.fields.getTextInputValue('inp_st_name'); const r = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_select_status').setPlaceholder('Status...').addOptions(STATUS_OPTIONS)); await interaction.reply({content:`Status for **${tempStatusName}**:`, components:[r], ephemeral:true}); }
    if (interaction.customId === 'menu_st_select_status') { const s = STATUS_OPTIONS.find(o=>o.value===interaction.values[0]); if(tempStatusName&&s){ statusDatabase[tempStatusName] = {emoji:s.emoji, descTH:s.descTH, descEN:s.descEN}; await saveStatusData(); await interaction.reply({content:'✅ Added', ephemeral:true}); } }
    if (interaction.customId === 'menu_st_delete') { delete statusDatabase[interaction.values[0]]; await saveStatusData(); await interaction.reply({content:'🗑️ Deleted', ephemeral:true}); }
    if (interaction.customId === 'menu_st_edit_select') { tempStatusName = interaction.values[0]; const r = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_edit_value').setPlaceholder('New Status...').addOptions(STATUS_OPTIONS)); await interaction.update({content:`Editing **${tempStatusName}**...`, components:[r]}); }
    if (interaction.customId === 'menu_st_edit_value') { const s = STATUS_OPTIONS.find(o=>o.value===interaction.values[0]); if(tempStatusName&&s){ statusDatabase[tempStatusName] = {emoji:s.emoji, descTH:s.descTH, descEN:s.descEN}; await saveStatusData(); await interaction.update({content:'✨ Updated', components:[]}); } }
});

client.login(TOKEN);
