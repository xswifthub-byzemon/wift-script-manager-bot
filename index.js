const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- ⚙️ ตั้งค่า ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID; 
const SCRIPT_DB_FILE = './scripts.json';
const STATUS_DB_FILE = './status.json';

// ตัวแปรระบบ
let scriptDatabase = {};
let statusDatabase = {}; 

// ตัวแปรเก็บข้อความ Dashboard (เพื่ออัปเดต Real-time)
let activeScriptPanelEN = null;
let activeScriptPanelTH = null;
let activeAdminScriptPanel = null;
let activeStatusPanel = null;
let activeStatusAdminPanel = null;

let userSelections = new Map(); 
let activeEditTarget = null;
let tempStatusName = null; 

// --- 📂 โหลดข้อมูล ---
function loadData() {
    if (fs.existsSync(SCRIPT_DB_FILE)) { try { scriptDatabase = JSON.parse(fs.readFileSync(SCRIPT_DB_FILE, 'utf8')); } catch (e) { scriptDatabase = {}; } }
    if (fs.existsSync(STATUS_DB_FILE)) { try { statusDatabase = JSON.parse(fs.readFileSync(STATUS_DB_FILE, 'utf8')); } catch (e) { statusDatabase = {}; } }
}
loadData();

// --- 💾 บันทึกข้อมูล ---
async function saveScriptData() {
    fs.writeFileSync(SCRIPT_DB_FILE, JSON.stringify(scriptDatabase, null, 4));
    await updateAllScriptDashboards(); 
}

async function saveStatusData() {
    fs.writeFileSync(STATUS_DB_FILE, JSON.stringify(statusDatabase, null, 4));
    await updateStatusDashboard();
}

// --- 🔥 Slash Commands ---
const commands = [
    new SlashCommandBuilder().setName('admin').setDescription('🔧 Script Admin Panel (Owner Only)'),
    new SlashCommandBuilder().setName('status-admin').setDescription('🔧 Status Admin Panel (Owner Only)'),
    new SlashCommandBuilder().setName('getscript-en').setDescription('🇺🇸 Create Script Panel (English)'),
    new SlashCommandBuilder().setName('getscript-th').setDescription('🇹🇭 Create Script Panel (Thai)'),
    new SlashCommandBuilder().setName('status-panel').setDescription('📊 Create Status Dashboard'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`น้องปาย Swift Script Hub พร้อมทำงานแล้วค่ะ! Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); console.log('Reloaded commands.'); } catch (error) { console.error(error); }
});

// ==========================================
// 🎨 ZONE 1: SCRIPT HUB (ระบบแจกสคริปต์)
// ==========================================

async function generateUserPanelPayload(lang) {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;
    const isEN = lang === 'en';

    const title = isEN ? '📂 Swift Script Hub' : '📂 Swift Script Hub บริการแจกสคริปต์';
    const footer = isEN ? 'Powered by Pai ❤️ | Select script & Click button' : 'Powered by Pai ❤️ | เลือกสคริปต์แล้วกดปุ่มรับ';
    
    let description = '';
    if (hasScripts) {
        // ✨ รายการสคริปต์ (ใช้ Block Quote >)
        const list = scriptKeys.map((k, i) => isEN 
            ? `> **Script ${i + 1}** : ${k}` 
            : `> **สคริปต์ ${i + 1}** : ${k}`
        ).join('\n');

        if (isEN) {
            description = `
**Thank you for using Swift Hub!** ❤️
We provide high-quality scripts just for you.

⚠️ **Warning:** Using scripts involves risk. Please play responsibly and safely.
----------------------------------------------------
**📜 Available Scripts (${scriptKeys.length}):**
${list}

*Select a script from the dropdown below and click "Get Script".*
`;
        } else {
            description = `
**ขอบคุณที่ไว้ใจใช้บริการ Swift Hub นะคะ** ❤️
เราคัดสรรสคริปต์คุณภาพมาเพื่อคุณโดยเฉพาะ

⚠️ **คำเตือน:** การใช้สคริปต์มีความเสี่ยง โปรดเล่นอย่างมีสติและระมัดระวังด้วยนะคะ
----------------------------------------------------
**📜 สคริปต์ที่พร้อมใช้งาน (${scriptKeys.length}):**
${list}

*เลือกสคริปต์จากเมนูด้านล่าง แล้วกดปุ่ม "รับสคริปต์" นะคะ*
`;
        }
    } else {
        description = isEN ? '❌ **Out of Stock**' : '❌ **คลังว่างเปล่า**';
    }

    const embed = new EmbedBuilder().setColor(hasScripts ? '#0099ff' : '#808080').setTitle(title).setDescription(description).setThumbnail(client.user.displayAvatarURL()).setFooter({ text: footer });
    
    // Dropdown ID
    const selectId = isEN ? 'select_script_en' : 'select_script_th';
    const btnId = isEN ? 'btn_get_en' : 'btn_get_th';

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(selectId)
        .setPlaceholder(hasScripts ? (isEN ? '🔻 Select script...' : '🔻 เลือกสคริปต์ที่ต้องการ...') : (isEN ? '⛔ Empty' : '⛔ ไม่มีสคริปต์'))
        .setDisabled(!hasScripts);

    if (hasScripts) {
        const resetLabel = isEN ? '❌ Reset Selection' : '❌ ยกเลิกการเลือก (Reset)';
        const options = [
            { label: resetLabel, value: 'reset_selection', emoji: '🔄' },
            ...scriptKeys.map((key, index) => ({ 
                label: isEN ? `Script ${index + 1}` : `สคริปต์ ${index + 1}`, 
                description: key.substring(0, 100), 
                value: key, 
                emoji: '📜' 
            }))
        ].slice(0, 25);
        selectMenu.addOptions(options);
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none' }]);
    }

    const getButton = new ButtonBuilder().setCustomId(btnId).setLabel(isEN ? 'Get Script 📥' : 'รับสคริปต์ 📥').setStyle(ButtonStyle.Success).setDisabled(!hasScripts);
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), new ActionRowBuilder().addComponents(getButton)] };
}

async function generateAdminScriptPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Script Admin Control').setDescription(`**จัดการคลังสคริปต์**\n\n📊 มีทั้งหมด: **${Object.keys(scriptDatabase).length}** สคริปต์`).setThumbnail(client.user.displayAvatarURL());
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
// 📊 ZONE 2: STATUS DASHBOARD (ระบบสถานะ)
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
    
    let statusList = 'No scripts status available.';
    if (keys.length > 0) {
        // ✨ จัดรูปแบบ: อังกฤษบน ไทยล่าง
        statusList = keys.map(k => {
            const item = statusDatabase[k];
            return `• ${item.emoji} : **${k}**\n   🇺🇸 ${item.descEN}\n   🇹🇭 ${item.descTH}`;
        }).join('\n\n');
    }

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🕐 Current Status')
        .setDescription(`**${now} (GMT+07)**\n\n⏲️ **Script Working 24/7**\n\n${statusList}`)
        .setImage('https://media.discordapp.net/attachments/123/123/placeholder.png')
        .setFooter({ text: 'Swift Hub Status System', iconURL: client.user.displayAvatarURL() });

    const legendEmbed = new EmbedBuilder().setColor('#202225').setDescription(`
🟢 Undetected - ใช้งานได้ปกติ
🟡 Risky - มีโอกาสโดนแบน
🟠 Updating... - กำลังอัปเดต
🔴 Detected - โดนตรวจจับ
⚫ Discontinued - เลิกทำแล้ว
    `);

    return { embeds: [embed, legendEmbed] };
}

async function generateStatusAdminPanel() {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('🔧 Status Admin Panel').setDescription('จัดการสถานะสคริปต์ในหน้า Dashboard\nกดปุ่มด้านล่างเพื่อ เพิ่ม / ลบ / แก้ไข').setThumbnail(client.user.displayAvatarURL());
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
    
    // --- Slash Commands ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'getscript-en') activeScriptPanelEN = await interaction.reply({ ...(await generateUserPanelPayload('en')), fetchReply: true });
        if (commandName === 'getscript-th') activeScriptPanelTH = await interaction.reply({ ...(await generateUserPanelPayload('th')), fetchReply: true });
        if (commandName === 'admin') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeAdminScriptPanel = await interaction.reply({ ...(await generateAdminScriptPanel()), fetchReply: true }); }
        if (commandName === 'status-panel') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeStatusPanel = await interaction.reply({ ...(await generateStatusPanelPayload()), fetchReply: true }); }
        if (commandName === 'status-admin') { if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫', ephemeral: true }); activeStatusAdminPanel = await interaction.reply({ ...(await generateStatusAdminPanel()), fetchReply: true }); }
    }

    // --- SCRIPT HUB INTERACTIONS ---
    if ((interaction.customId === 'select_script_en' || interaction.customId === 'select_script_th') && interaction.isStringSelectMenu()) {
        if (interaction.values[0] === 'reset_selection') { userSelections.delete(interaction.user.id); return interaction.update(await generateUserPanelPayload(interaction.customId.includes('_en') ? 'en' : 'th')); }
        userSelections.set(interaction.user.id, interaction.values[0]);
        await interaction.reply({ content: interaction.customId.includes('_en') ? `✅ Selected **${interaction.values[0]}**!` : `✅ เลือก **${interaction.values[0]}** แล้ว!`, ephemeral: true });
    }

    if ((interaction.customId === 'btn_get_en' || interaction.customId === 'btn_get_th') && interaction.isButton()) {
        const name = userSelections.get(interaction.user.id);
        if (!name || !scriptDatabase[name]) return interaction.reply({ content: '⚠️ Please select a script first! / กรุณาเลือกสคริปต์ก่อน', ephemeral: true });
        const code = scriptDatabase[name];
        const isEN = interaction.customId.includes('_en');

        // ✨ Embed ผลลัพธ์: กู้คืน Footer และ Description สวยๆ
        const embed = new EmbedBuilder().setColor('#00FF00')
            .setTitle(isEN ? `📜 Script Map : ${name}` : `📜 สคริปต์แมพ : ${name}`)
            .addFields({ name: isEN ? 'Code Script:' : 'โค้ดสคริปต์:', value: `\`${code}\`` })
            .setFooter({ text: isEN ? 'Thank you for using Swift Hub! ❤️' : 'ขอบคุณที่ไว้ใจ Swift Hub นะคะ ❤️', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        if (isEN) {
            embed.setDescription('Here is your script! Enjoy and play safe. 🎮');
        } else {
            embed.setDescription('นี่คือสคริปต์ของคุณค่ะ! ขอให้สนุกกับการใช้งานนะคะ 🎮\n*⚠️ คำเตือน: การใช้สคริปต์มีความเสี่ยง โปรดเล่นอย่างมีสติและระมัดระวังด้วยนะคะ*');
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // --- SCRIPT ADMIN ---
    if (['btn_add', 'btn_check', 'btn_edit', 'btn_delete'].includes(interaction.customId) && interaction.user.id === OWNER_ID) {
        if (interaction.customId === 'btn_add') {
            const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อ").setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ด").setStyle(TextInputStyle.Paragraph).setRequired(true)));
            await interaction.showModal(modal);
        }
        if (interaction.customId === 'btn_check') await interaction.reply({ content: `**Scripts:**\n\`\`\`\n${Object.keys(scriptDatabase).join('\n') || 'Empty'}\n\`\`\``, ephemeral: true });
        if (interaction.customId === 'btn_delete') {
            const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (!opts.length) return interaction.reply({ content: 'Empty', ephemeral: true });
            await interaction.reply({ content: 'Delete:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('Select').addOptions(opts))], ephemeral: true });
        }
        if (interaction.customId === 'btn_edit') {
            const opts = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (!opts.length) return interaction.reply({ content: 'Empty', ephemeral: true });
            await interaction.reply({ content: 'Edit:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_edit').setPlaceholder('Select').addOptions(opts))], ephemeral: true });
        }
    }
    // Modals & Menus for Script Admin
    if (interaction.customId === 'modal_add' && interaction.isModalSubmit()) { scriptDatabase[interaction.fields.getTextInputValue('inp_name')] = interaction.fields.getTextInputValue('inp_code'); await saveScriptData(); await interaction.reply({ content: '✅ Added', ephemeral: true }); }
    if (interaction.customId === 'menu_delete' && interaction.isStringSelectMenu()) { delete scriptDatabase[interaction.values[0]]; await saveScriptData(); await interaction.reply({ content: '🗑️ Deleted', ephemeral: true }); }
    if (interaction.customId === 'menu_edit' && interaction.isStringSelectMenu()) { activeEditTarget = interaction.values[0]; const m = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`Edit: ${activeEditTarget}`); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_code').setLabel("New Code").setStyle(TextInputStyle.Paragraph).setRequired(true))); await interaction.showModal(m); }
    if (interaction.customId === 'modal_edit_save' && interaction.isModalSubmit()) { if(activeEditTarget){ scriptDatabase[activeEditTarget] = interaction.fields.getTextInputValue('inp_new_code'); await saveScriptData(); await interaction.reply({ content: '✨ Edited', ephemeral: true }); } }

    // --- STATUS ADMIN INTERACTIONS ---
    
    // Add
    if (interaction.customId === 'btn_st_add' && interaction.isButton()) {
        const modal = new ModalBuilder().setCustomId('modal_st_name').setTitle('เพิ่มสถานะสคริปต์');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_st_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)));
        await interaction.showModal(modal);
    }
    if (interaction.customId === 'modal_st_name' && interaction.isModalSubmit()) {
        tempStatusName = interaction.fields.getTextInputValue('inp_st_name');
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_select_status').setPlaceholder('เลือกสถานะ...').addOptions(STATUS_OPTIONS));
        await interaction.reply({ content: `เลือกสถานะสำหรับ **${tempStatusName}**:`, components: [row], ephemeral: true });
    }
    if (interaction.customId === 'menu_st_select_status' && interaction.isStringSelectMenu()) {
        const s = STATUS_OPTIONS.find(o => o.value === interaction.values[0]);
        if (tempStatusName && s) {
            statusDatabase[tempStatusName] = { emoji: s.emoji, descTH: s.descTH, descEN: s.descEN };
            await saveStatusData();
            await interaction.reply({ content: `✅ เพิ่ม **${tempStatusName}** เรียบร้อย!`, ephemeral: true });
        }
    }

    // Delete
    if (interaction.customId === 'btn_st_delete' && interaction.isButton()) {
        const keys = Object.keys(statusDatabase);
        if (!keys.length) return interaction.reply({ content: 'ไม่มีข้อมูล', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_delete').setPlaceholder('เลือกตัวลบ...').addOptions(keys.map(k=>({label:k, value:k})).slice(0,25)));
        await interaction.reply({ content: 'ลบอันไหนดีคะ:', components: [row], ephemeral: true });
    }
    if (interaction.customId === 'menu_st_delete' && interaction.isStringSelectMenu()) {
        delete statusDatabase[interaction.values[0]];
        await saveStatusData();
        await interaction.reply({ content: '🗑️ ลบเรียบร้อย!', ephemeral: true });
    }

    // Edit (Feature Added!)
    if (interaction.customId === 'btn_st_edit' && interaction.isButton()) {
        const keys = Object.keys(statusDatabase);
        if (!keys.length) return interaction.reply({ content: 'ไม่มีข้อมูลให้แก้', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_edit_select').setPlaceholder('เลือกสคริปต์ที่จะแก้...').addOptions(keys.map(k=>({label:k, value:k})).slice(0,25)));
        await interaction.reply({ content: 'เลือกสคริปต์ที่ต้องการแก้ไขสถานะค่ะ:', components: [row], ephemeral: true });
    }
    if (interaction.customId === 'menu_st_edit_select' && interaction.isStringSelectMenu()) {
        tempStatusName = interaction.values[0];
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_edit_value').setPlaceholder(`เลือกสถานะใหม่ของ ${tempStatusName}...`).addOptions(STATUS_OPTIONS));
        await interaction.update({ content: `กำลังแก้ไขสถานะของ **${tempStatusName}**\nเลือกสถานะใหม่ด้านล่างเลยค่ะ:`, components: [row] });
    }
    if (interaction.customId === 'menu_st_edit_value' && interaction.isStringSelectMenu()) {
        const s = STATUS_OPTIONS.find(o => o.value === interaction.values[0]);
        if (tempStatusName && s && statusDatabase[tempStatusName]) {
            statusDatabase[tempStatusName] = { emoji: s.emoji, descTH: s.descTH, descEN: s.descEN };
            await saveStatusData();
            await interaction.update({ content: `✨ อัปเดตสถานะ **${tempStatusName}** เป็น ${s.emoji} เรียบร้อย!`, components: [] });
        }
    }

});

client.login(TOKEN);
