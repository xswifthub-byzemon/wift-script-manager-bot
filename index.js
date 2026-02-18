const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- ⚙️ ตั้งค่า ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID; 
const DB_FILE = './scripts.json';

// ตัวแปรระบบ
let scriptDatabase = {};
let activeDashboardEN = null; // เก็บ Panel อังกฤษ
let activeDashboardTH = null; // เก็บ Panel ไทย
let activeAdminDashboard = null; // เก็บ Panel แอดมิน (เพื่ออัปเดตเลข Real-time)
let userSelections = new Map(); 
let activeEditTarget = null; 

// โหลดข้อมูล
if (fs.existsSync(DB_FILE)) {
    try {
        scriptDatabase = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
        console.error("Error loading scripts:", err);
        scriptDatabase = {};
    }
}

// ฟังก์ชั่นบันทึกและอัปเดตทุกหน้าจอ
async function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(scriptDatabase, null, 4));
    await updateAllDashboards(); // ✨ อัปเดตทุก Panel ทันที
}

// --- 🔥 ลงทะเบียน Slash Command (แยก 3 คำสั่ง) ---
const commands = [
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('🔧 Admin Control Panel (Owner Only)'),
    new SlashCommandBuilder()
        .setName('getscript-en')
        .setDescription('🇺🇸 Create Script Panel (English Version)'),
    new SlashCommandBuilder()
        .setName('getscript-th')
        .setDescription('🇹🇭 สร้างหน้าต่างรับสคริปต์ (เวอร์ชั่นภาษาไทย)'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`น้องปาย Swift Script Hub พร้อมทำงานแล้วค่ะ! Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// --- 🎨 Helper: สร้าง User Panel (แยกภาษา) ---
async function generateUserPanelPayload(lang) {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;
    const isEN = lang === 'en';

    // ข้อความตามภาษา
    const title = isEN ? '📂 Swift Script Hub' : '📂 Swift Script Hub บริการแจกสคริปต์';
    const footer = isEN ? 'Powered by Pai ❤️ | Select script & Click button' : 'Powered by Pai ❤️ | เลือกสคริปต์แล้วกดปุ่มรับ';
    
    let description = '';
    if (hasScripts) {
        const list = scriptKeys.map((k, i) => `\` ${i + 1} \` ${k}`).join('\n');
        description = isEN 
            ? `**📜 Available Scripts (${scriptKeys.length}):**\n${list}\n\n*Select a script from the dropdown below and click "Get Script".*`
            : `**📜 สคริปต์ที่พร้อมใช้งาน (${scriptKeys.length}):**\n${list}\n\n*เลือกสคริปต์จากเมนูด้านล่าง แล้วกดปุ่ม "รับสคริปต์" นะคะ*`;
    } else {
        description = isEN
            ? '❌ **Out of Stock**\nWaiting for update...'
            : '❌ **คลังว่างเปล่า**\nรอซีม่อนมาเติมของแป๊บนึงน้าา...';
    }

    const embed = new EmbedBuilder()
        .setColor(hasScripts ? '#0099ff' : '#808080')
        .setTitle(title)
        .setDescription(description)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: footer });

    // ID แยกตามภาษา (_en, _th)
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
            ...scriptKeys.map(key => ({ label: key, value: key, emoji: '📜' }))
        ].slice(0, 25);
        selectMenu.addOptions(options);
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none', description: 'No scripts' }]);
    }

    const getButton = new ButtonBuilder()
        .setCustomId(btnId)
        .setLabel(isEN ? 'Get Script 📥' : 'รับสคริปต์ 📥')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasScripts);

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu), new ActionRowBuilder().addComponents(getButton)] };
}

// --- 🔧 Helper: สร้าง Admin Panel (Real-time) ---
async function generateAdminPanelPayload() {
    const scriptCount = Object.keys(scriptDatabase).length;

    const embed = new EmbedBuilder()
        .setColor('#FF0000') // สีแดง Admin
        .setTitle('🔧 Admin Control Panel')
        .setDescription(`**จัดการคลังสคริปต์ของซีม่อน**\n\n📊 สถานะปัจจุบัน:\n#️⃣ **มีทั้งหมด ${scriptCount} สคริปต์**\n\n*เลือกเมนูจัดการด้านล่างได้เลยค่ะ*`)
        .setThumbnail(client.user.displayAvatarURL())
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
        new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไข').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    return { embeds: [embed], components: [row] };
}

// --- 🔄 ฟังก์ชั่นอัปเดตทุกหน้าจอ ---
async function updateAllDashboards() {
    // 1. อัปเดต Panel อังกฤษ
    if (activeDashboardEN) {
        try { await activeDashboardEN.edit(await generateUserPanelPayload('en')); } 
        catch (e) { activeDashboardEN = null; }
    }
    // 2. อัปเดต Panel ไทย
    if (activeDashboardTH) {
        try { await activeDashboardTH.edit(await generateUserPanelPayload('th')); } 
        catch (e) { activeDashboardTH = null; }
    }
    // 3. ✨ อัปเดต Admin Panel (Real-time Count)
    if (activeAdminDashboard) {
        try { await activeAdminDashboard.edit(await generateAdminPanelPayload()); }
        catch (e) { activeAdminDashboard = null; }
    }
}

// --- ⚡ Interaction Handler ---
client.on('interactionCreate', async (interaction) => {
    
    // 🔥 SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // /getscript-en
        if (commandName === 'getscript-en') {
            const payload = await generateUserPanelPayload('en');
            const msg = await interaction.reply({ ...payload, fetchReply: true });
            activeDashboardEN = msg;
        }

        // /getscript-th
        if (commandName === 'getscript-th') {
            const payload = await generateUserPanelPayload('th');
            const msg = await interaction.reply({ ...payload, fetchReply: true });
            activeDashboardTH = msg;
        }

        // /admin
        if (commandName === 'admin') {
            if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '🚫 No Access!', ephemeral: true });
            
            const payload = await generateAdminPanelPayload();
            const msg = await interaction.reply({ ...payload, fetchReply: true });
            activeAdminDashboard = msg; // จำข้อความไว้เพื่ออัปเดตเลข
        }
    }

    // 🟢 USER INTERACTION (English)
    if (interaction.customId === 'select_script_en' && interaction.isStringSelectMenu()) {
        const val = interaction.values[0];
        if (val === 'reset_selection') {
            userSelections.delete(interaction.user.id);
            return interaction.reply({ content: '🔄 Selection cleared!', ephemeral: true });
        }
        userSelections.set(interaction.user.id, val);
        await interaction.reply({ content: `✅ Selected **${val}**! Click "Get Script" button below.`, ephemeral: true });
    }

    if (interaction.customId === 'btn_get_en' && interaction.isButton()) {
        const scriptName = userSelections.get(interaction.user.id);
        if (!scriptName || !scriptDatabase[scriptName]) return interaction.reply({ content: '⚠️ Please select a script from the dropdown first!', ephemeral: true });
        
        const code = scriptDatabase[scriptName];
        await interaction.reply({ content: `✨ **${scriptName}** is here! 👇\n\`\`\`lua\n${code}\n\`\`\``, ephemeral: true });
    }

    // 🟢 USER INTERACTION (Thai)
    if (interaction.customId === 'select_script_th' && interaction.isStringSelectMenu()) {
        const val = interaction.values[0];
        if (val === 'reset_selection') {
            userSelections.delete(interaction.user.id);
            return interaction.reply({ content: '🔄 ยกเลิกการเลือกเรียบร้อย!', ephemeral: true });
        }
        userSelections.set(interaction.user.id, val);
        await interaction.reply({ content: `✅ เลือก **${val}** แล้ว! กดปุ่ม "รับสคริปต์" ด้านล่างได้เลยค่ะ`, ephemeral: true });
    }

    if (interaction.customId === 'btn_get_th' && interaction.isButton()) {
        const scriptName = userSelections.get(interaction.user.id);
        if (!scriptName || !scriptDatabase[scriptName]) return interaction.reply({ content: '⚠️ กรุณาเลือกสคริปต์จากเมนูก่อนกดปุ่มนะคะ!', ephemeral: true });
        
        const code = scriptDatabase[scriptName];
        await interaction.reply({ content: `✨ **${scriptName}** มาแล้วค่ะซีม่อนจัดให้! 👇\n\`\`\`lua\n${code}\n\`\`\``, ephemeral: true });
    }

    // 🔴 ADMIN INTERACTION
    if (!['btn_add', 'btn_check', 'btn_edit', 'btn_delete', 'menu_delete', 'menu_select_edit'].includes(interaction.customId) && !interaction.isModalSubmit()) return;
    if (interaction.user.id !== OWNER_ID && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

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
        const list = keys.length > 0 ? keys.map((k, i) => `${i+1}. ${k}`).join('\n') : 'ว่างเปล่า...';
        await interaction.reply({ content: `**รายการสคริปต์ทั้งหมด (${keys.length}):**\n\`\`\`\n${list}\n\`\`\``, ephemeral: true });
    }

    if (interaction.customId === 'btn_delete') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้ลบเลยค่ะ', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวที่จะลบ').addOptions(options));
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะลบเลยค่ะ:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_edit') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้แก้เลยค่ะ', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_select_edit').setPlaceholder('เลือกตัวที่จะแก้').addOptions(options));
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะแก้ไขค่ะ:', components: [row], ephemeral: true });
    }

    // Modal Submit & Menu Selections
    if (interaction.isModalSubmit() && interaction.customId === 'modal_add') {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        scriptDatabase[name] = code;
        await saveDatabase(); // 🔄 Trigger Update All Panels
        await interaction.reply({ content: `✅ เพิ่มสคริปต์ **${name}** แล้ว! (Admin Panel อัปเดตแล้ว)`, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_delete') {
        const name = interaction.values[0];
        delete scriptDatabase[name];
        await saveDatabase(); // 🔄 Trigger Update All Panels
        await interaction.reply({ content: `🗑️ ลบ **${name}** แล้ว! (Admin Panel อัปเดตแล้ว)`, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_select_edit') {
        if (interaction.user.id !== OWNER_ID) return;
        activeEditTarget = interaction.values[0];
        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${activeEditTarget.substring(0, 20)}`);
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inp_new_code').setLabel("วางโค้ดใหม่ที่นี่").setStyle(TextInputStyle.Paragraph).setRequired(true)));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_save') {
        const newCode = interaction.fields.getTextInputValue('inp_new_code');
        if (activeEditTarget && scriptDatabase[activeEditTarget]) {
            scriptDatabase[activeEditTarget] = newCode;
            await saveDatabase();
            await interaction.reply({ content: `✨ แก้ไข **${activeEditTarget}** เรียบร้อย!`, ephemeral: true });
            activeEditTarget = null;
        } else {
            await interaction.reply({ content: '⚠️ Error: หาชื่อไม่เจอ', ephemeral: true });
        }
    }
});

client.login(TOKEN);
