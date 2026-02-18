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
let activeDashboard = null; 
let userSelections = new Map(); 
let activeEditTarget = null; // ตัวแปรสำหรับแก้ไขสคริปต์

// โหลดข้อมูล
if (fs.existsSync(DB_FILE)) {
    try {
        scriptDatabase = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
        console.error("Error loading scripts:", err);
        scriptDatabase = {};
    }
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(scriptDatabase, null, 4));
    updateDashboard(); 
}

// --- 🔥 ส่วนลงทะเบียน Slash Command ---
const commands = [
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('จัดการคลังสคริปต์ (เฉพาะเจ้าของ)'),
    new SlashCommandBuilder()
        .setName('getscript')
        .setDescription('เปิดหน้าต่างรับสคริปต์'),
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

// --- ฟังก์ชั่นสร้าง/อัปเดตหน้า Dashboard ---
async function generateDashboardPayload() {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;

    const embed = new EmbedBuilder()
        .setColor(hasScripts ? '#0099ff' : '#808080')
        .setTitle('📂 Swift Script Hub Service')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Powered by Pai ❤️ | Swift Script Hub' });

    if (hasScripts) {
        // คำอธิบาย 2 ภาษา
        const description = `
**🇺🇸 HOW TO USE:**
1. Select a script from the dropdown menu below.
2. Click the **"Get Script 📥"** button to receive the code.

**🇹🇭 วิธีการใช้งาน:**
1. เลือกสคริปต์ที่ต้องการจากเมนู Dropdown ด้านล่าง
2. กดปุ่ม **"รับสคริปต์ 📥"** เพื่อรับโค้ดทันที

----------------------------------------------------
**📜 รายชื่อสคริปต์ที่พร้อมใช้งาน (${scriptKeys.length}):**
${scriptKeys.map((k, i) => `\` ${i + 1} \` ${k}`).join('\n')}
`;
        embed.setDescription(description);
    } else {
        embed.setDescription('❌ **Out of Stock / คลังว่างเปล่า**\nWaiting for update... / รอซีม่อนมาเติมของแป๊บนึงน้าา...');
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_script_user')
        .setPlaceholder(hasScripts ? '🔻 Click here to select script...' : '⛔ No scripts available')
        .setDisabled(!hasScripts);

    if (hasScripts) {
        // เพิ่มตัวเลือก Reset ไว้บนสุด
        const options = [
            {
                label: '❌ ยกเลิกการเลือก (Reset Selection)',
                value: 'reset_selection',
                description: 'Clear your current selection',
                emoji: '🔄'
            },
            ...scriptKeys.map(key => ({
                label: key,
                value: key,
                description: 'Click to select this script',
                emoji: '📜'
            }))
        ].slice(0, 25); // Limit 25
        
        selectMenu.addOptions(options);
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none', description: 'No scripts available' }]);
    }

    const getButton = new ButtonBuilder()
        .setCustomId('btn_get_script_final')
        .setLabel('รับสคริปต์ (Get Script)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📥')
        .setDisabled(!hasScripts);

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(getButton);

    return { embeds: [embed], components: [row1, row2] };
}

async function updateDashboard() {
    if (activeDashboard) {
        try {
            const payload = await generateDashboardPayload();
            await activeDashboard.edit(payload);
        } catch (err) {
            console.log("Dashboard update failed.");
            activeDashboard = null;
        }
    }
}

// --- 2. จัดการ Interaction ---
client.on('interactionCreate', async (interaction) => {
    
    // 🔥 Slash Command
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'getscript') {
            const payload = await generateDashboardPayload();
            const msg = await interaction.reply({ ...payload, fetchReply: true });
            activeDashboard = msg;
        }

        if (commandName === 'admin') {
            if (interaction.user.id !== OWNER_ID) {
                return interaction.reply({ content: 'อุ๊บส์! คำสั่งนี้สำหรับซีม่อนสุดหล่อคนเดียวค่ะ 🤫', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔧 Admin Control Panel')
                .setDescription(`จัดการคลังสคริปต์ของซีม่อน (มีทั้งหมด ${Object.keys(scriptDatabase).length} สคริปต์)`)
                .setThumbnail(client.user.displayAvatarURL());

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
                new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
                new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไข').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
                new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // 🟢 User Interaction
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_script_user') {
        const selectedValue = interaction.values[0];

        // ระบบ Reset Selection
        if (selectedValue === 'reset_selection') {
            userSelections.delete(interaction.user.id);
            return interaction.reply({ 
                content: '🔄 **ล้างค่าการเลือกเรียบร้อย!** (Reset Successful)', 
                ephemeral: true 
            });
        }

        userSelections.set(interaction.user.id, selectedValue);
        await interaction.reply({ 
            content: `✅ คุณเลือก **${selectedValue}** แล้ว!\nกดปุ่ม **"รับสคริปต์ 📥"** ด้านล่างได้เลยค่ะ`, 
            ephemeral: true 
        });
    }

    if (interaction.isButton() && interaction.customId === 'btn_get_script_final') {
        const selectedScript = userSelections.get(interaction.user.id);
        
        if (!selectedScript || !scriptDatabase[selectedScript]) {
            return interaction.reply({ 
                content: '⚠️ **กรุณาเลือกสคริปต์ก่อนค่ะ!** (Please select a script first)\nเลือกจากเมนูด้านบน หรือถ้าเลือกแล้วให้ลองเลือกใหม่นะคะ', 
                ephemeral: true 
            });
        }

        const code = scriptDatabase[selectedScript];
        
        // ส่งสคริปต์พร้อมกล่อง Code Block
        await interaction.reply({
            content: `✨ **${selectedScript}** มาแล้วค่ะซีม่อนจัดให้! 👇\n\`\`\`lua\n${code}\n\`\`\``,
            ephemeral: true 
        });
    }

    // 🔴 Admin Interaction
    if (!['btn_add', 'btn_check', 'btn_edit', 'btn_delete', 'menu_delete', 'menu_select_edit'].includes(interaction.customId) && !interaction.isModalSubmit()) return;
    if (interaction.user.id !== OWNER_ID && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    if (interaction.isButton() && interaction.customId === 'btn_add') {
        const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์ใหม่');
        const nameInput = new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true);
        const codeInput = new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    if (interaction.isButton() && interaction.customId === 'btn_check') {
        const keys = Object.keys(scriptDatabase);
        const scriptList = keys.length > 0 ? keys.map((k, i) => `${i+1}. ${k}`).join('\n') : 'ว่างเปล่า...';
        await interaction.reply({ content: `**รายการสคริปต์ทั้งหมด:**\n\`\`\`\n${scriptList}\n\`\`\``, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_delete') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้ลบเลยค่ะ', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวที่จะลบ').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะลบเลยค่ะ:', components: [row], ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'btn_edit') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้แก้เลยค่ะ', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_select_edit').setPlaceholder('เลือกตัวที่จะแก้').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะแก้ไขค่ะ:', components: [row], ephemeral: true });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_add') {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        scriptDatabase[name] = code;
        saveDatabase(); 
        await interaction.reply({ content: `✅ เพิ่มสคริปต์ **${name}** เรียบร้อย! Panel หน้าบ้านอัปเดตแล้วค่ะ`, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_delete') {
        const name = interaction.values[0];
        delete scriptDatabase[name];
        saveDatabase(); 
        await interaction.reply({ content: `🗑️ ลบ **${name}** เรียบร้อย! Panel หน้าบ้านอัปเดตแล้วค่ะ`, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_select_edit') {
        const name = interaction.values[0];
        if (interaction.user.id !== OWNER_ID) return; 
        activeEditTarget = name;
        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${name.substring(0, 20)}`);
        const codeInput = new TextInputBuilder().setCustomId('inp_new_code').setLabel("วางโค้ดใหม่ที่นี่").setStyle(TextInputStyle.Paragraph).setPlaceholder("วางโค้ดใหม่ทับอันเดิมได้เลยค่ะ").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_save') {
        const newCode = interaction.fields.getTextInputValue('inp_new_code');
        if (typeof activeEditTarget !== 'undefined' && activeEditTarget && scriptDatabase[activeEditTarget] !== undefined) {
            scriptDatabase[activeEditTarget] = newCode;
            saveDatabase();
            await interaction.reply({ content: `✨ อัพเดตโค้ด **${activeEditTarget}** เรียบร้อยค่ะ!`, ephemeral: true });
            activeEditTarget = null;
        } else {
             await interaction.reply({ content: `⚠️ ขอโทษค่ะ ระบบจำไม่ได้ว่าแก้อันไหน ลองกดแก้ไขใหม่นะคะ`, ephemeral: true });
        }
    }
});

client.login(TOKEN);
