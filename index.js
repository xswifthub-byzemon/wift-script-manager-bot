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
const STATUS_DB_FILE = './status.json'; // ไฟล์เก็บสถานะสคริปต์

// ตัวแปรระบบ
let scriptDatabase = {};
let statusDatabase = {}; // เก็บข้อมูลสถานะ { "ชื่อสคริปต์": { status: "🟢", text: "Undetected..." } }

// ตัวแปรเก็บข้อความ Dashboard (เพื่ออัปเดต Real-time)
let activeScriptPanelEN = null;
let activeScriptPanelTH = null;
let activeAdminScriptPanel = null;
let activeStatusPanel = null; // Panel สถานะหน้าบ้าน
let activeStatusAdminPanel = null; // Panel สถานะหลังบ้าน

let userSelections = new Map(); 
let activeEditTarget = null;
let tempStatusName = null; // ตัวแปรฝากชื่อตอนเพิ่มสถานะ

// --- 📂 โหลดข้อมูล ---
function loadData() {
    if (fs.existsSync(SCRIPT_DB_FILE)) {
        try { scriptDatabase = JSON.parse(fs.readFileSync(SCRIPT_DB_FILE, 'utf8')); } catch (e) { scriptDatabase = {}; }
    }
    if (fs.existsSync(STATUS_DB_FILE)) {
        try { statusDatabase = JSON.parse(fs.readFileSync(STATUS_DB_FILE, 'utf8')); } catch (e) { statusDatabase = {}; }
    }
}
loadData();

// --- 💾 บันทึกข้อมูล ---
async function saveScriptData() {
    fs.writeFileSync(SCRIPT_DB_FILE, JSON.stringify(scriptDatabase, null, 4));
    await updateAllScriptDashboards(); 
}

async function saveStatusData() {
    fs.writeFileSync(STATUS_DB_FILE, JSON.stringify(statusDatabase, null, 4));
    await updateStatusDashboard(); // อัปเดตหน้าสถานะทันที
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
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
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
        // ✨ รายการสคริปต์ (ใช้ Block Quote > เพื่อไม่ให้ก๊อปเป็นโค้ด)
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

    const embed = new EmbedBuilder()
        .setColor(hasScripts ? '#0099ff' : '#808080')
        .setTitle(title)
        .setDescription(description)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: footer });

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
                label: isEN ? `Script ${index + 1}` : `สคริปต์ ${index + 1}`, // แสดงแค่ลำดับใน Dropdown
                description: key.substring(0, 100), // ใส่ชื่อจริงในคำอธิบาย
                value: key, 
                emoji: '📜' 
            }))
        ].slice(0, 25);
        selectMenu.addOptions(options);
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none' }]);
    }

    const getButton = new ButtonBuilder()
        .setCustomId(btnId)
        .setLabel(isEN ? 'Get Script 📥' : 'รับสคริปต์ 📥')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasScripts);

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), new ActionRowBuilder().addComponents(getButton)] };
}

async function generateAdminScriptPanel() {
    const scriptCount = Object.keys(scriptDatabase).length;
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔧 Script Admin Control')
        .setDescription(`**จัดการคลังสคริปต์**\n\n📊 มีทั้งหมด: **${scriptCount}** สคริปต์`)
        .setThumbnail(client.user.displayAvatarURL());

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
        new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไข').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    return { embeds: [embed], components: [row] };
}

async function updateAllScriptDashboards() {
    if (activeScriptPanelEN) { try { await activeScriptPanelEN.edit(await generateUserPanelPayload('en')); } catch (e) { activeScriptPanelEN = null; } }
    if (activeScriptPanelTH) { try { await activeScriptPanelTH.edit(await generateUserPanelPayload('th')); } catch (e) { activeScriptPanelTH = null; } }
    if (activeAdminScriptPanel) { try { await activeAdminScriptPanel.edit(await generateAdminScriptPanel()); } catch (e) { activeAdminScriptPanel = null; } }
}

// ==========================================
// 📊 ZONE 2: STATUS DASHBOARD (ระบบสถานะ)
// ==========================================

const STATUS_OPTIONS = [
    { label: 'Undetected - ใช้งานได้ปกติ', value: 'green', emoji: '🟢', desc: 'Undetected' },
    { label: 'Risky - มีโอกาสโดนแบน', value: 'yellow', emoji: '🟡', desc: 'Risky' },
    { label: 'Updating - กำลังอัปเดต', value: 'orange', emoji: '🟠', desc: 'Updating...' },
    { label: 'Detected - โดนตรวจจับ', value: 'red', emoji: '🔴', desc: 'Detected (Wait update)' },
    { label: 'Discontinued - เลิกทำแล้ว', value: 'black', emoji: '⚫', desc: 'Discontinued' }
];

async function generateStatusPanelPayload() {
    // เวลาไทย
    const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: true, dateStyle: 'short', timeStyle: 'short' });
    
    let statusList = '';
    const keys = Object.keys(statusDatabase);
    if (keys.length > 0) {
        statusList = keys.map(k => {
            const item = statusDatabase[k];
            return `• ${item.emoji} ${k}`;
        }).join('\n');
    } else {
        statusList = 'No scripts status available.';
    }

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🕐 Current Status')
        .setDescription(`**${now} (GMT+07)**\n\n⏲️ **Script Working 24/7**\n\n${statusList}`)
        .setImage('https://media.discordapp.net/attachments/123/123/placeholder.png') // ใส่รูปแบนเนอร์ถ้ามี
        .setFooter({ text: 'Swift Hub Status System', iconURL: client.user.displayAvatarURL() });

    // Legend (คำอธิบายสี)
    const legendEmbed = new EmbedBuilder()
        .setColor('#202225')
        .setDescription(`
🟢 Undetected - ใช้งานได้ปกติ
🟡 Risky - มีโอกาสโดนแบน
🟠 Updating... - กำลังอัปเดต
🔴 Detected (Wait new update) - โดนตรวจจับ (รออัปเดต)
⚫ Discontinued - เลิกทำแล้ว (ถ้าหากกระแสกลับมาดี อาจกลับไปทำ)
        `);

    return { embeds: [embed, legendEmbed] };
}

async function generateStatusAdminPanel() {
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔧 Status Admin Panel')
        .setDescription('จัดการสถานะสคริปต์ในหน้า Dashboard\nกดปุ่มด้านล่างเพื่อเพิ่มหรือแก้ไข')
        .setThumbnail(client.user.displayAvatarURL());

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_st_add').setLabel('เพิ่มสถานะ').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_st_delete').setLabel('ลบสถานะ').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    return { embeds: [embed], components: [row] };
}

async function updateStatusDashboard() {
    if (activeStatusPanel) {
        try { await activeStatusPanel.edit(await generateStatusPanelPayload()); } 
        catch (e) { activeStatusPanel = null; }
    }
}

// ==========================================
// ⚡ INTERACTION HANDLER
// ==========================================

client.on('interactionCreate', async (interaction) => {
    
    // --- Slash Commands ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        
        // Script Hub Commands
        if (commandName === 'getscript-en') {
            activeScriptPanelEN = await interaction.reply({ ...(await generateUserPanelPayload('en')), fetchReply: true });
        }
        if (commandName === 'getscript-th') {
            activeScriptPanelTH = await interaction.reply({ ...(await generateUserPanelPayload('th')), fetchReply: true });
        }
        if (commandName === 'admin') {
            if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫 No Access!', ephemeral: true });
            activeAdminScriptPanel = await interaction.reply({ ...(await generateAdminScriptPanel()), fetchReply: true });
        }

        // Status Dashboard Commands
        if (commandName === 'status-panel') {
            if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫 No Access!', ephemeral: true });
            activeStatusPanel = await interaction.reply({ ...(await generateStatusPanelPayload()), fetchReply: true });
        }
        if (commandName === 'status-admin') {
            if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫 No Access!', ephemeral: true });
            activeStatusAdminPanel = await interaction.reply({ ...(await generateStatusAdminPanel()), fetchReply: true });
        }
    }

    // ------------------------------------
    // 🟢 SCRIPT HUB INTERACTIONS
    // ------------------------------------
    
    // Selection
    if ((interaction.customId === 'select_script_en' || interaction.customId === 'select_script_th') && interaction.isStringSelectMenu()) {
        const val = interaction.values[0];
        const isEN = interaction.customId === 'select_script_en';
        
        if (val === 'reset_selection') {
            userSelections.delete(interaction.user.id);
            return interaction.update(await generateUserPanelPayload(isEN ? 'en' : 'th'));
        }
        
        userSelections.set(interaction.user.id, val);
        const msg = isEN ? `✅ Selected **${val}**!` : `✅ เลือก **${val}** แล้ว!`;
        await interaction.reply({ content: msg, ephemeral: true });
    }

    // Get Button
    if ((interaction.customId === 'btn_get_en' || interaction.customId === 'btn_get_th') && interaction.isButton()) {
        const scriptName = userSelections.get(interaction.user.id);
        if (!scriptName || !scriptDatabase[scriptName]) {
            return interaction.reply({ content: '⚠️ Please select a script first! / กรุณาเลือกสคริปต์ก่อน', ephemeral: true });
        }
        const code = scriptDatabase[scriptName];
        const isEN = interaction.customId === 'btn_get_en';

        // Embed Result (แก้ไขหัวข้อตามสั่ง)
        const resultEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(isEN ? `📜 Script Map : ${scriptName}` : `📜 สคริปต์แมพ : ${scriptName}`)
            .setDescription(isEN ? 'Enjoy and play safe. 🎮' : 'ขอให้สนุกกับการใช้งานนะคะ 🎮')
            .addFields({ name: isEN ? 'Code Script:' : 'โค้ดสคริปต์:', value: `\`${code}\`` })
            .setFooter({ text: 'Swift Hub', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [resultEmbed], ephemeral: true });
    }

    // Admin Script Controls
    if (['btn_add', 'btn_check', 'btn_edit', 'btn_delete'].includes(interaction.customId)) {
        if (interaction.user.id !== OWNER_ID) return;

        if (interaction.customId === 'btn_add') {
            const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์ใหม่');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        if (interaction.customId === 'btn_check') {
            const keys = Object.keys(scriptDatabase);
            const list = keys.length > 0 ? keys.map((k, i) => `${i+1}. ${k}`).join('\n') : 'ว่างเปล่า';
            await interaction.reply({ content: `**Scripts:**\n\`\`\`\n${list}\n\`\`\``, ephemeral: true });
        }
        if (interaction.customId === 'btn_delete') {
            const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (options.length === 0) return interaction.reply({ content: 'Empty', ephemeral: true });
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวลบ').addOptions(options));
            await interaction.reply({ content: 'Select to delete:', components: [row], ephemeral: true });
        }
        if (interaction.customId === 'btn_edit') {
            const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
            if (options.length === 0) return interaction.reply({ content: 'Empty', ephemeral: true });
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_edit').setPlaceholder('เลือกตัวแก้').addOptions(options));
            await interaction.reply({ content: 'Select to edit:', components: [row], ephemeral: true });
        }
    }

    // Handle Script Admin Modals/Menus
    if (interaction.customId === 'modal_add' && interaction.isModalSubmit()) {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        scriptDatabase[name] = code;
        await saveScriptData();
        await interaction.reply({ content: `✅ Added **${name}**`, ephemeral: true });
    }
    if (interaction.customId === 'menu_delete' && interaction.isStringSelectMenu()) {
        delete scriptDatabase[interaction.values[0]];
        await saveScriptData();
        await interaction.reply({ content: `🗑️ Deleted **${interaction.values[0]}**`, ephemeral: true });
    }
    if (interaction.customId === 'menu_edit' && interaction.isStringSelectMenu()) {
        activeEditTarget = interaction.values[0];
        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`Edit: ${activeEditTarget}`);
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_code').setLabel("New Code").setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await interaction.showModal(modal);
    }
    if (interaction.customId === 'modal_edit_save' && interaction.isModalSubmit()) {
        if (activeEditTarget) {
            scriptDatabase[activeEditTarget] = interaction.fields.getTextInputValue('inp_new_code');
            await saveScriptData();
            await interaction.reply({ content: `✨ Edited **${activeEditTarget}**`, ephemeral: true });
        }
    }


    // ------------------------------------
    // 📊 STATUS DASHBOARD INTERACTIONS
    // ------------------------------------

    if (interaction.customId === 'btn_st_add' && interaction.isButton()) {
        // ขั้นตอนที่ 1: เปิด Modal ใส่ชื่อ
        const modal = new ModalBuilder().setCustomId('modal_st_name').setTitle('เพิ่มสถานะสคริปต์');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_st_name').setLabel("ชื่อสคริปต์ (เช่น Blox Fruit)").setStyle(TextInputStyle.Short).setRequired(true)));
        await interaction.showModal(modal);
    }

    if (interaction.customId === 'modal_st_name' && interaction.isModalSubmit()) {
        // ขั้นตอนที่ 2: รับชื่อ แล้วส่ง Dropdown ให้เลือกสถานะ
        tempStatusName = interaction.fields.getTextInputValue('inp_st_name');
        
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('menu_st_select_status')
                .setPlaceholder('เลือกสถานะของสคริปต์นี้...')
                .addOptions(STATUS_OPTIONS)
        );
        
        await interaction.reply({ content: `เลือกสถานะสำหรับ **${tempStatusName}**:`, components: [row], ephemeral: true });
    }

    if (interaction.customId === 'menu_st_select_status' && interaction.isStringSelectMenu()) {
        // ขั้นตอนที่ 3: บันทึกสถานะ
        const statusValue = interaction.values[0]; // e.g., 'green'
        const statusObj = STATUS_OPTIONS.find(s => s.value === statusValue);
        
        if (tempStatusName && statusObj) {
            statusDatabase[tempStatusName] = {
                emoji: statusObj.emoji,
                desc: statusObj.desc
            };
            await saveStatusData();
            await interaction.reply({ content: `✅ เพิ่มสถานะ **${tempStatusName}** : ${statusObj.emoji} เรียบร้อย!`, ephemeral: true });
        }
    }

    if (interaction.customId === 'btn_st_delete' && interaction.isButton()) {
        const keys = Object.keys(statusDatabase);
        if (keys.length === 0) return interaction.reply({ content: 'ไม่มีสถานะให้ลบ', ephemeral: true });
        
        const options = keys.map(k => ({ label: k, value: k })).slice(0, 25);
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_st_delete').setPlaceholder('เลือกตัวที่จะลบ').addOptions(options));
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะลบสถานะ:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'menu_st_delete' && interaction.isStringSelectMenu()) {
        const name = interaction.values[0];
        delete statusDatabase[name];
        await saveStatusData();
        await interaction.reply({ content: `🗑️ ลบสถานะ **${name}** เรียบร้อย!`, ephemeral: true });
    }

});

client.login(TOKEN);
