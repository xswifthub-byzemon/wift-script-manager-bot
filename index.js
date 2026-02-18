const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const express = require('express'); // 🌐 เพิ่ม Express สำหรับทำเว็บ
require('dotenv').config();

// --- ⚙️ ตั้งค่า (CONFIG) ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
// ⚠️ ใส่โดเมน Railway ของคุณที่นี่ (ไม่ต้องมี https://) หรือตั้งใน Railway Variables ชื่อ PUBLIC_DOMAIN
const DOMAIN = process.env.PUBLIC_DOMAIN || 'ใส่-domain-railway-ของคุณ.up.railway.app'; 
const PORT = process.env.PORT || 3000;

const SCRIPT_DB_FILE = './scripts.json';
const STATUS_DB_FILE = './status.json';
const DEFAULT_IMG = 'https://media.discordapp.net/attachments/1206634567890123456/1206634567890123456/placeholder.png'; // 🖼️ ใส่ลิ้งค์รูปโลโก้เริ่มต้นที่นี่

// --- 🤖 DISCORD CLIENT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// --- 🌐 WEB SERVER (EXPRESS) ---
const app = express();

// หน้าเว็บสำหรับแสดงสคริปต์ (HTML Template)
const generateHtml = (scriptData, lang) => {
    const isEN = lang === 'en';
    const title = isEN ? 'Swift Script Hub' : 'Swift Script Hub';
    const copyBtn = isEN ? 'COPY SCRIPT' : 'คัดลอกสคริปต์';
    const backBtn = isEN ? 'Back to Discord' : 'กลับไปที่ Discord';
    const warning = isEN ? '⚠️ Use at your own risk. Play safe!' : '⚠️ การใช้งานมีความเสี่ยง โปรดเล่นอย่างระมัดระวัง';
    
    return `
    <!DOCTYPE html>
    <html lang="${lang}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - ${scriptData.name}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap');
            body { background-color: #0f0f13; color: #fff; font-family: 'Kanit', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
            .container { background: #1e1f24; padding: 30px; border-radius: 15px; box-shadow: 0 0 20px rgba(0, 153, 255, 0.2); max-width: 600px; width: 100%; text-align: center; border: 1px solid #2f3136; }
            h1 { color: #0099ff; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; }
            .subtitle { color: #b9bbbe; font-size: 0.9em; margin-bottom: 20px; }
            .script-img { width: 100%; max-height: 250px; object-fit: cover; border-radius: 10px; margin-bottom: 20px; border: 2px solid #202225; }
            .code-box { position: relative; background: #2f3136; padding: 15px; border-radius: 8px; text-align: left; margin-bottom: 20px; border: 1px solid #40444b; }
            pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; color: #a9fdac; font-family: 'Consolas', monospace; font-size: 0.9em; max-height: 300px; overflow-y: auto; }
            .btn { background: linear-gradient(45deg, #0099ff, #0055ff); border: none; padding: 12px 25px; color: white; border-radius: 25px; font-size: 1em; cursor: pointer; font-weight: bold; transition: 0.3s; width: 100%; display: block; margin-top: 10px; text-decoration: none; }
            .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(0, 85, 255, 0.4); }
            .btn-secondary { background: #4f545c; }
            .btn-secondary:hover { background: #5d6269; }
            .warning { color: #ed4245; font-size: 0.8em; margin-top: 15px; border-top: 1px solid #40444b; padding-top: 10px; }
            .toast { visibility: hidden; min-width: 250px; background-color: #3ba55c; color: #fff; text-align: center; border-radius: 5px; padding: 16px; position: fixed; z-index: 1; left: 50%; bottom: 30px; transform: translateX(-50%); font-size: 17px; }
            .toast.show { visibility: visible; animation: fadein 0.5s, fadeout 0.5s 2.5s; }
            @keyframes fadein { from {bottom: 0; opacity: 0;} to {bottom: 30px; opacity: 1;} }
            @keyframes fadeout { from {bottom: 30px; opacity: 1;} to {bottom: 0; opacity: 0;} }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Swift Script Hub</h1>
            <div class="subtitle">By Zemon Źx For Pai Èx</div>
            
            <img src="${scriptData.image || 'https://via.placeholder.com/600x300?text=No+Image'}" alt="Script Preview" class="script-img">
            
            <div style="text-align: left; margin-bottom: 10px; font-weight: bold; color: #fff;">📜 ${scriptData.name}</div>
            
            <div class="code-box">
                <pre id="scriptCode">${scriptData.code}</pre>
            </div>

            <button class="btn" onclick="copyCode()">${copyBtn}</button>
            <div class="warning">${warning}</div>
        </div>

        <div id="toast">✅ Copied to clipboard!</div>

        <script>
            function copyCode() {
                var codeText = document.getElementById("scriptCode").innerText;
                navigator.clipboard.writeText(codeText).then(function() {
                    var x = document.getElementById("toast");
                    x.className = "show";
                    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
                }, function(err) {
                    alert('Could not copy text');
                });
            }
        </script>
    </body>
    </html>
    `;
};

// Route: ดูสคริปต์
app.get('/view/:key', (req, res) => {
    const key = req.params.key;
    const lang = req.query.lang || 'th';
    const script = scriptDatabase[key];

    if (!script) return res.status(404).send('<h1>404 - Script Not Found / ไม่พบสคริปต์</h1>');
    
    // แปลงข้อมูลเก่า (String) ให้เป็น Object ถ้าจำเป็น
    const scriptData = typeof script === 'string' ? { name: key, code: script, image: DEFAULT_IMG } : { name: key, ...script };
    
    res.send(generateHtml(scriptData, lang));
});

// เริ่ม Server
app.listen(PORT, () => console.log(`🌐 Website running on port ${PORT}`));


// --- 📂 DATA MANAGEMENT ---
let scriptDatabase = {};
let statusDatabase = {}; 
let userSelections = new Map(); 
let activeEditTarget = null;
let tempStatusName = null; 

// ตัวแปร Dashboard
let activeScriptPanelEN = null;
let activeScriptPanelTH = null;
let activeAdminScriptPanel = null;
let activeStatusPanel = null;
let activeStatusAdminPanel = null;

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

// --- 🔥 SLASH COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('admin').setDescription('🔧 Script Admin Panel (Owner)'),
    new SlashCommandBuilder().setName('status-admin').setDescription('🔧 Status Admin Panel (Owner)'),
    new SlashCommandBuilder().setName('getscript-en').setDescription('🇺🇸 Script Panel (EN)'),
    new SlashCommandBuilder().setName('getscript-th').setDescription('🇹🇭 Script Panel (TH)'),
    new SlashCommandBuilder().setName('status-panel').setDescription('📊 Status Dashboard'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`น้องปาย Swift Script Hub พร้อมทำงานแล้วค่ะ! Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); console.log('✅ Commands Registered.'); } catch (error) { console.error(error); }
});

// ==========================================
// 🎨 ZONE 1: SCRIPT HUB (Link System)
// ==========================================

async function generateUserPanelPayload(lang) {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;
    const isEN = lang === 'en';

    const title = isEN ? '📂 Swift Script Hub' : '📂 Swift Script Hub บริการแจกสคริปต์';
    const footer = isEN ? 'Powered by Pai ❤️ | Select script & Click button' : 'Powered by Pai ❤️ | เลือกสคริปต์แล้วกดปุ่มรับ';
    
    let description = '';
    if (hasScripts) {
        // แสดงชื่อสคริปต์
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

    const getButton = new ButtonBuilder()
        .setCustomId(isEN ? 'btn_get_en' : 'btn_get_th')
        .setLabel(isEN ? 'Get Script Link 🔗' : 'รับลิ้งค์สคริปต์ 🔗')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasScripts);

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

// ==========================================
// 📊 ZONE 2: STATUS DASHBOARD
// ==========================================
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
    let statusList = keys.length > 0 ? keys.map(k => {
        const item = statusDatabase[k];
        return `• ${item.emoji} : **${k}**\n   🇺🇸 ${item.descEN}\n   🇹🇭 ${item.descTH}`;
    }).join('\n\n') : 'No status available.';

    const embed = new EmbedBuilder().setColor('#2b2d31').setTitle('🕐 Current Status').setDescription(`**${now} (GMT+07)**\n\n⏲️ **Script Working 24/7**\n\n${statusList}`).setFooter({ text: 'Swift Hub Status System', iconURL: client.user.displayAvatarURL() });
    const legendEmbed = new EmbedBuilder().setColor('#202225').setDescription('🟢 Undetected  🟡 Risky  🟠 Updating...  🔴 Detected  ⚫ Discontinued');
    return { embeds: [embed, legendEmbed] };
}

async function generateStatusAdminPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Status Admin Panel').setDescription('จัดการสถานะสคริปต์').setThumbnail(client.user.displayAvatarURL());
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

// ==========================================
// ⚡ INTERACTION HANDLER
// ==========================================

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'getscript-en') activeScriptPanelEN = await interaction.reply({ ...(await generateUserPanelPayload('en')), fetchReply: true });
        if (commandName === 'getscript-th') activeScriptPanelTH = await interaction.reply({ ...(await generateUserPanelPayload('th')), fetchReply: true });
        if (commandName === 'admin') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeAdminScriptPanel = await interaction.reply({ ...(await generateAdminScriptPanel()), fetchReply: true }); }
        if (commandName === 'status-panel') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeStatusPanel = await interaction.reply({ ...(await generateStatusPanelPayload()), fetchReply: true }); }
        if (commandName === 'status-admin') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeStatusAdminPanel = await interaction.reply({ ...(await generateStatusAdminPanel()), fetchReply: true }); }
    }

    // --- SCRIPT HUB (Web Link) ---
    if ((interaction.customId === 'select_script_en' || interaction.customId === 'select_script_th') && interaction.isStringSelectMenu()) {
        if (interaction.values[0] === 'reset_selection') { userSelections.delete(interaction.user.id); return interaction.update(await generateUserPanelPayload(interaction.customId.includes('_en') ? 'en' : 'th')); }
        userSelections.set(interaction.user.id, interaction.values[0]);
        await interaction.reply({ content: interaction.customId.includes('_en') ? `✅ Selected **${interaction.values[0]}**!` : `✅ เลือก **${interaction.values[0]}** แล้ว!`, ephemeral: true });
    }

    if ((interaction.customId === 'btn_get_en' || interaction.customId === 'btn_get_th') && interaction.isButton()) {
        const name = userSelections.get(interaction.user.id);
        if (!name || !scriptDatabase[name]) return interaction.reply({ content: '⚠️ Please select a script first!', ephemeral: true });
        
        const isEN = interaction.customId.includes('_en');
        // สร้างลิ้งค์เว็บ (https://โดเมน/view/ชื่อสคริปต์?lang=th)
        const webLink = `https://${DOMAIN}/view/${encodeURIComponent(name)}?lang=${isEN ? 'en' : 'th'}`;

        const embed = new EmbedBuilder().setColor('#00FF00')
            .setTitle(isEN ? `🔗 Script Ready: ${name}` : `🔗 สคริปต์พร้อมแล้ว: ${name}`)
            .setDescription(isEN ? `Click the link below to view and copy the script.` : `คลิกลิ้งค์ด้านล่างเพื่อดูและคัดลอกสคริปต์ค่ะ`)
            .addFields({ name: isEN ? 'Web Link:' : 'ลิ้งค์หน้าเว็บ:', value: `[👉 Click Here / กดที่นี่](${webLink})` })
            .setFooter({ text: isEN ? 'Thank you for using Swift Hub! ❤️' : 'ขอบคุณที่ไว้ใจ Swift Hub นะคะ ❤️', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(isEN ? 'Open Script Page' : 'เปิดหน้าสคริปต์').setStyle(ButtonStyle.Link).setURL(webLink).setEmoji('🌐'));
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // --- SCRIPT ADMIN (Add/Edit with Image) ---
    if (['btn_add', 'btn_edit', 'btn_delete', 'btn_check'].includes(interaction.customId) && interaction.user.id === OWNER_ID) {
        if (interaction.customId === 'btn_check') await interaction.reply({ content: `**Scripts:**\n\`\`\`\n${Object.keys(scriptDatabase).join('\n') || 'Empty'}\n\`\`\``, ephemeral: true });
        
        // Add Script
        if (interaction.customId === 'btn_add') {
            const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์ (Web)');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_img').setLabel("ลิ้งค์รูปภาพ (Optional)").setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        
        // Edit Script
        if (interaction.customId === 'btn_edit') {
            const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (!opts.length) return interaction.reply({ content: 'Empty', ephemeral: true });
            await interaction.reply({ content: 'Edit:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_edit').setPlaceholder('Select').addOptions(opts))], ephemeral: true });
        }

        // Delete Script
        if (interaction.customId === 'btn_delete') {
            const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (!opts.length) return interaction.reply({ content: 'Empty', ephemeral: true });
            await interaction.reply({ content: 'Delete:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('Select').addOptions(opts))], ephemeral: true });
        }
    }

    // Modal Handling (Add/Edit)
    if (interaction.customId === 'modal_add' && interaction.isModalSubmit()) {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        const img = interaction.fields.getTextInputValue('inp_img') || DEFAULT_IMG;
        
        scriptDatabase[name] = { code: code, image: img };
        await saveScriptData();
        await interaction.reply({ content: `✅ Added **${name}** (Image updated)`, ephemeral: true });
    }

    if (interaction.customId === 'menu_edit' && interaction.isStringSelectMenu()) {
        activeEditTarget = interaction.values[0];
        const oldData = scriptDatabase[activeEditTarget];
        const oldCode = typeof oldData === 'string' ? oldData : oldData.code;
        const oldImg = typeof oldData === 'string' ? '' : oldData.image;

        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`Edit: ${activeEditTarget.substring(0, 20)}`);
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_img').setLabel("New Image URL").setStyle(TextInputStyle.Short).setValue(oldImg).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_code').setLabel("New Code").setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        await interaction.showModal(modal);
    }

    if (interaction.customId === 'modal_edit_save' && interaction.isModalSubmit()) {
        if (activeEditTarget) {
            const newCode = interaction.fields.getTextInputValue('inp_new_code');
            const newImg = interaction.fields.getTextInputValue('inp_new_img') || DEFAULT_IMG;
            scriptDatabase[activeEditTarget] = { code: newCode, image: newImg };
            await saveScriptData();
            await interaction.reply({ content: `✨ Edited **${activeEditTarget}**`, ephemeral: true });
        }
    }

    if (interaction.customId === 'menu_delete' && interaction.isStringSelectMenu()) {
        delete scriptDatabase[interaction.values[0]];
        await saveScriptData();
        await interaction.reply({ content: '🗑️ Deleted', ephemeral: true });
    }

    // --- STATUS ADMIN (Same as before) ---
    if (['btn_st_add', 'btn_st_edit', 'btn_st_delete'].includes(interaction.customId)) {
        if (interaction.customId === 'btn_st_add') {
            const modal = new ModalBuilder().setCustomId('modal_st_name').setTitle('เพิ่มสถานะ');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_st_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal);
        }
        if (interaction.customId === 'btn_st_delete') {
            const keys = Object.keys(statusDatabase);
            if(!keys.length) return interaction.reply({content:'Empty', ephemeral:true});
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_delete').setPlaceholder('Delete...').addOptions(keys.map(k=>({label:k,value:k})).slice(0,25)));
            await interaction.reply({content:'Select to delete:', components:[row], ephemeral:true});
        }
        if (interaction.customId === 'btn_st_edit') {
            const keys = Object.keys(statusDatabase);
            if(!keys.length) return interaction.reply({content:'Empty', ephemeral:true});
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_edit_select').setPlaceholder('Edit...').addOptions(keys.map(k=>({label:k,value:k})).slice(0,25)));
            await interaction.reply({content:'Select to edit:', components:[row], ephemeral:true});
        }
    }
    // Status Modals/Menus
    if (interaction.customId === 'modal_st_name' && interaction.isModalSubmit()) {
        tempStatusName = interaction.fields.getTextInputValue('inp_st_name');
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_select_status').setPlaceholder('Status...').addOptions(STATUS_OPTIONS));
        await interaction.reply({ content: `Status for **${tempStatusName}**:`, components: [row], ephemeral: true });
    }
    if (interaction.customId === 'menu_st_select_status' && interaction.isStringSelectMenu()) {
        const s = STATUS_OPTIONS.find(o => o.value === interaction.values[0]);
        if (tempStatusName && s) {
            statusDatabase[tempStatusName] = { emoji: s.emoji, descTH: s.descTH, descEN: s.descEN };
            await saveStatusData();
            await interaction.reply({ content: `✅ Added **${tempStatusName}**`, ephemeral: true });
        }
    }
    if (interaction.customId === 'menu_st_delete' && interaction.isStringSelectMenu()) {
        delete statusDatabase[interaction.values[0]];
        await saveStatusData();
        await interaction.reply({ content: '🗑️ Deleted status', ephemeral: true });
    }
    if (interaction.customId === 'menu_st_edit_select' && interaction.isStringSelectMenu()) {
        tempStatusName = interaction.values[0];
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_edit_value').setPlaceholder(`New status for ${tempStatusName}...`).addOptions(STATUS_OPTIONS));
        await interaction.update({ content: `Editing **${tempStatusName}**... Select new status:`, components: [row] });
    }
    if (interaction.customId === 'menu_st_edit_value' && interaction.isStringSelectMenu()) {
        const s = STATUS_OPTIONS.find(o => o.value === interaction.values[0]);
        if (tempStatusName && s) {
            statusDatabase[tempStatusName] = { emoji: s.emoji, descTH: s.descTH, descEN: s.descEN };
            await saveStatusData();
            await interaction.update({ content: `✨ Updated **${tempStatusName}**`, components: [] });
        }
    }
});

client.login(TOKEN);
