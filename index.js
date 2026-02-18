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

// --- 🔥 ส่วนลงทะเบียน Slash Command (เพิ่มใหม่) ---
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

    // ลงทะเบียนคำสั่งกับ Discord ทันทีที่รัน
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        // ลงทะเบียนแบบ Global (อาจใช้เวลาอัปเดต 1-5 นาทีในบางครั้ง)
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
        .setTitle('📂 Swift Script Hub')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Powered by Pai ❤️ | Select script & Click button' });

    if (hasScripts) {
        const listText = scriptKeys.map((k, i) => `> **${i + 1}. ${k}**`).join('\n');
        embed.setDescription(`**รายชื่อสคริปต์ที่พร้อมใช้งาน:**\n${listText}\n\n*เลือกสคริปต์จากเมนูด้านล่าง แล้วกดปุ่ม "รับสคริปต์" นะคะ*`);
    } else {
        embed.setDescription('❌ **ตอนนี้คลังสคริปต์ว่างเปล่าค่ะ**\nรอซีม่อนมาเติมของแป๊บนึงน้าา...');
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_script_user')
        .setPlaceholder(hasScripts ? '🔻 เลือกสคริปต์ที่ต้องการ...' : '⛔ ไม่มีสคริปต์')
        .setDisabled(!hasScripts);

    if (hasScripts) {
        const options = scriptKeys.map(key => ({
            label: key,
            value: key,
            description: 'คลิกเพื่อเลือก',
            emoji: '📜'
        })).slice(0, 25);
        selectMenu.addOptions(options);
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none', description: 'No scripts available' }]);
    }

    const getButton = new ButtonBuilder()
        .setCustomId('btn_get_script_final')
        .setLabel('รับสคริปต์')
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
            console.log("Dashboard update failed (message might be deleted).");
            activeDashboard = null;
        }
    }
}

// --- 2. จัดการ Interaction (รวม Slash Command และปุ่ม) ---
client.on('interactionCreate', async (interaction) => {
    
    // 🔥 จัดการ Slash Command (/admin, /getscript)
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // คำสั่ง /getscript
        if (commandName === 'getscript') {
            const payload = await generateDashboardPayload();
            // ส่งข้อความและจำไว้เพื่ออัปเดต
            const msg = await interaction.reply({ ...payload, fetchReply: true });
            activeDashboard = msg;
        }

        // คำสั่ง /admin
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

            await interaction.reply({ embeds: [embed], components: [row] }); // Admin เห็นคนเดียวหรือไม่ก็ได้ อันนี้ตั้งให้เห็นปกติ
        }
    }

    // ------------------------------------------
    // 🟢 โซน User ใช้งาน (ปุ่มและเมนู)
    // ------------------------------------------

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_script_user') {
        const selectedScript = interaction.values[0];
        userSelections.set(interaction.user.id, selectedScript);
        await interaction.reply({ 
            content: `✅ คุณเลือก **${selectedScript}** แล้ว! กดปุ่ม **"รับสคริปต์"** สีเขียวด้านล่างได้เลยค่ะ`, 
            ephemeral: true 
        });
    }

    if (interaction.isButton() && interaction.customId === 'btn_get_script_final') {
        const selectedScript = userSelections.get(interaction.user.id);
        if (!selectedScript || !scriptDatabase[selectedScript]) {
            return interaction.reply({ 
                content: '⚠️ กรุณาเลือกสคริปต์จากเมนู Dropdown ด้านบนก่อนกดปุ่มนะคะ!', 
                ephemeral: true 
            });
        }
        const code = scriptDatabase[selectedScript];
        await interaction.reply({
            content: `**${selectedScript}** มาแล้วค่ะซีม่อนจัดให้! 👇\n\`\`\`lua\n${code}\n\`\`\``,
            ephemeral: true 
        });
    }

    // ------------------------------------------
    // 🔴 โซน Admin (Logic เดิม)
    // ------------------------------------------
    
    if (!['btn_add', 'btn_check', 'btn_edit', 'btn_delete', 'menu_delete', 'menu_select_edit'].includes(interaction.customId) && !interaction.isModalSubmit()) return;
    
    // Check ID (ถ้าไม่ใช่ Slash Command ต้องเช็คตรงนี้ด้วย)
    if (interaction.user.id !== OWNER_ID && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    // ปุ่มเติม
    if (interaction.isButton() && interaction.customId === 'btn_add') {
        const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์ใหม่');
        const nameInput = new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true);
        const codeInput = new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // ปุ่มเช็ค
    if (interaction.isButton() && interaction.customId === 'btn_check') {
        const keys = Object.keys(scriptDatabase);
        const scriptList = keys.length > 0 ? keys.map((k, i) => `${i+1}. ${k}`).join('\n') : 'ว่างเปล่า...';
        await interaction.reply({ content: `**รายการสคริปต์ทั้งหมด:**\n\`\`\`\n${scriptList}\n\`\`\``, ephemeral: true });
    }

    // ปุ่มลบ
    if (interaction.isButton() && interaction.customId === 'btn_delete') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้ลบเลยค่ะ', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวที่จะลบ').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะลบเลยค่ะ:', components: [row], ephemeral: true });
    }

    // ปุ่มแก้ไข
    if (interaction.isButton() && interaction.customId === 'btn_edit') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้แก้เลยค่ะ', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_select_edit').setPlaceholder('เลือกตัวที่จะแก้').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะแก้ไขค่ะ:', components: [row], ephemeral: true });
    }

    // Modal Submit (เติม)
    if (interaction.isModalSubmit() && interaction.customId === 'modal_add') {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        scriptDatabase[name] = code;
        saveDatabase(); 
        await interaction.reply({ content: `✅ เพิ่มสคริปต์ **${name}** เรียบร้อย! Panel หน้าบ้านอัปเดตแล้วค่ะ`, ephemeral: true });
    }

    // Menu Select (ลบ)
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_delete') {
        const name = interaction.values[0];
        delete scriptDatabase[name];
        saveDatabase(); 
        await interaction.reply({ content: `🗑️ ลบ **${name}** เรียบร้อย! Panel หน้าบ้านอัปเดตแล้วค่ะ`, ephemeral: true });
    }

    // Menu Select (เลือกตัวแก้)
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_select_edit') {
        const name = interaction.values[0];
        // เช็คก่อนว่าใครกด
        if (interaction.user.id !== OWNER_ID) return; 
        
        // เราจะส่งชื่อผ่าน customId ของ Modal ไม่ได้ (มันยาวเกิน)
        // ใช้ cache ชั่วคราวเหมือนเดิม
        activeEditTarget = name; // ใช้ตัวแปร Global หรือแนบไปกับ client

        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${name.substring(0, 20)}`);
        const codeInput = new TextInputBuilder().setCustomId('inp_new_code').setLabel("วางโค้ดใหม่ที่นี่").setStyle(TextInputStyle.Paragraph).setPlaceholder("วางโค้ดใหม่ทับอันเดิมได้เลยค่ะ").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // Modal Submit (บันทึกแก้)
    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_save') {
        const newCode = interaction.fields.getTextInputValue('inp_new_code');
        
        // เนื่องจากเราไม่ได้ส่งชื่อมา เราต้องรู้ว่ากำลังแก้อันไหน
        // *ในเวอร์ชั่นนี้เพื่อความชัวร์ ปายแนะนำให้ซีม่อนแก้ทีละตัวนะคะ*
        // แต่เพื่อให้โค้ดสมบูรณ์ ปายจะใช้ชื่อจาก Title ของ Modal ก็ได้ แต่ Title มันถูกตัดคำ
        // ดังนั้นใช้ตัวแปร global 'activeEditTarget' ที่ประกาศไว้ข้างบน (แต่ต้องระวังถ้าแก้พร้อมกัน)
        // **เพิ่มตัวแปรนี้ด้านบนสุดของไฟล์ด้วยนะคะ: let activeEditTarget = null;**
        
        if (typeof activeEditTarget !== 'undefined' && activeEditTarget && scriptDatabase[activeEditTarget] !== undefined) {
            scriptDatabase[activeEditTarget] = newCode;
            saveDatabase();
            await interaction.reply({ content: `✨ อัพเดตโค้ด **${activeEditTarget}** เรียบร้อยค่ะ!`, ephemeral: true });
            activeEditTarget = null;
        } else {
             // Fallback: ถ้าหาไม่เจอ ให้ลองแก้แบบเพิ่มใหม่แทน หรือแจ้งเตือน
             await interaction.reply({ content: `⚠️ ขอโทษค่ะ ระบบจำไม่ได้ว่าแก้อันไหน ลองกดแก้ไขใหม่นะคะ`, ephemeral: true });
        }
    }
});

// เพิ่มตัวแปร global สำหรับการแก้ไข (ใส่ไว้บนสุดใต้ let userSelections ก็ได้)
let activeEditTarget = null; 

client.login(TOKEN);
