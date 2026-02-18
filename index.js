const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- ⚙️ ตั้งค่า ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID; 
const DB_FILE = './scripts.json';

// ตัวแปรเก็บข้อมูลระบบ
let scriptDatabase = {}; // เก็บสคริปต์
let activeDashboard = null; // เก็บข้อความ Panel ล่าสุดไว้เพื่ออัปเดต Real-time
let userSelections = new Map(); // เก็บว่าใครเลือกสคริปต์อะไรอยู่ (User ID -> Script Name)

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
    // ทุกครั้งที่เซฟข้อมูล ให้ไปอัปเดตหน้า Panel ด้วย
    updateDashboard(); 
}

client.once('ready', () => {
    console.log(`น้องปาย Swift Script Hub (Real-time) พร้อมทำงานแล้วค่ะ! Logged in as ${client.user.tag}`);
});

// --- ฟังก์ชั่นสร้าง/อัปเดตหน้า Dashboard ---
async function generateDashboardPayload() {
    const scriptKeys = Object.keys(scriptDatabase);
    const hasScripts = scriptKeys.length > 0;

    // 1. สร้าง Embed
    const embed = new EmbedBuilder()
        .setColor(hasScripts ? '#0099ff' : '#808080') // สีฟ้าถ้ามีของ สีเทาถ้าว่าง
        .setTitle('📂 Swift Script Hub')
        .setImage('https://media.discordapp.net/attachments/123456789/123456789/banner.png') // (ใส่ลิ้งค์แบนเนอร์ตรงนี้ได้นะคะถ้ามี)
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Powered by Pai ❤️ | Select script & Click button' });

    if (hasScripts) {
        // แสดงรายการสคริปต์ใน Embed แบบ Real-time
        const listText = scriptKeys.map((k, i) => `> **${i + 1}. ${k}**`).join('\n');
        embed.setDescription(`**รายชื่อสคริปต์ที่พร้อมใช้งาน:**\n${listText}\n\n*เลือกสคริปต์จากเมนูด้านล่าง แล้วกดปุ่ม "รับสคริปต์" นะคะ*`);
    } else {
        embed.setDescription('❌ **ตอนนี้คลังสคริปต์ว่างเปล่าค่ะ**\nรอซีม่อนมาเติมของแป๊บนึงน้าา...');
    }

    // 2. สร้าง Dropdown (เลือกสคริปต์)
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
        })).slice(0, 25); // Discord รับได้ max 25
        selectMenu.addOptions(options);
    } else {
        selectMenu.addOptions([{ label: 'Empty', value: 'none', description: 'No scripts available' }]);
    }

    // 3. สร้างปุ่ม (กดรับ)
    const getButton = new ButtonBuilder()
        .setCustomId('btn_get_script_final')
        .setLabel('รับสคริปต์')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📥')
        .setDisabled(!hasScripts); // ถ้าไม่มีสคริปต์ ปุ่มกดไม่ได้

    // จัดใส่ Row
    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(getButton);

    return { embeds: [embed], components: [row1, row2] };
}

// ฟังก์ชั่นอัปเดตข้อความเดิม (Real-time)
async function updateDashboard() {
    if (activeDashboard) {
        try {
            const payload = await generateDashboardPayload();
            await activeDashboard.edit(payload);
        } catch (err) {
            console.log("หาข้อความเดิมไม่เจอ หรือถูกลบไปแล้ว สร้างใหม่แทนเมื่อมีการเรียกใช้");
            activeDashboard = null;
        }
    }
}

// --- 1. จัดการคำสั่ง Slash Commands / Prefix ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 🟢 Panel สำหรับสมาชิก (/getscript)
    if (message.content === '/getscript') {
        const payload = await generateDashboardPayload();
        const msg = await message.channel.send(payload);
        activeDashboard = msg; // จำข้อความนี้ไว้ เพื่ออัปเดต Real-time
    }

    // 🔴 Panel หลังบ้าน (/admin)
    if (message.content === '/admin') {
        if (message.author.id !== OWNER_ID) return message.reply('อุ๊บส์! คำสั่งนี้สำหรับซีม่อนสุดหล่อคนเดียวค่ะ 🤫');

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

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// --- 2. จัดการ Interaction ---
client.on('interactionCreate', async (interaction) => {
    
    // ------------------------------------------
    // 🟢 โซน User ใช้งาน (เลือกสคริปต์ + กดรับ)
    // ------------------------------------------

    // จังหวะที่ 1: User เลือกของใน Dropdown
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_script_user') {
        const selectedScript = interaction.values[0];
        
        // บันทึกว่า User คนนี้เลือกอะไรไว้
        userSelections.set(interaction.user.id, selectedScript);

        // ตอบกลับแบบเงียบๆ ว่าเลือกแล้ว
        await interaction.reply({ 
            content: `✅ คุณเลือก **${selectedScript}** แล้ว! กดปุ่ม **"รับสคริปต์"** สีเขียวด้านล่างได้เลยค่ะ`, 
            ephemeral: true 
        });
    }

    // จังหวะที่ 2: User กดปุ่ม "รับสคริปต์"
    if (interaction.isButton() && interaction.customId === 'btn_get_script_final') {
        // เช็คว่า User เลือกของยัง?
        const selectedScript = userSelections.get(interaction.user.id);

        if (!selectedScript || !scriptDatabase[selectedScript]) {
            return interaction.reply({ 
                content: '⚠️ กรุณาเลือกสคริปต์จากเมนู Dropdown ด้านบนก่อนกดปุ่มนะคะ!', 
                ephemeral: true 
            });
        }

        const code = scriptDatabase[selectedScript];
        
        // ส่งสคริปต์ให้
        await interaction.reply({
            content: `**${selectedScript}** มาแล้วค่ะซีม่อนจัดให้! 👇\n\`\`\`lua\n${code}\n\`\`\``,
            ephemeral: true 
        });
    }

    // ------------------------------------------
    // 🔴 โซน Admin (เหมือนเดิมแต่เพิ่มอัปเดต Real-time)
    // ------------------------------------------
    
    if (!['btn_add', 'btn_check', 'btn_edit', 'btn_delete', 'menu_delete', 'menu_select_edit'].includes(interaction.customId) && !interaction.isModalSubmit()) return;
    if (interaction.user.id !== OWNER_ID && !interaction.isStringSelectMenu()) return; // check ID

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

    // --- Actions ---

    // Modal Submit (เติม) -> Auto Update Real-time
    if (interaction.isModalSubmit() && interaction.customId === 'modal_add') {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        scriptDatabase[name] = code;
        saveDatabase(); // ✨ ตรงนี้จะไปเรียก updateDashboard() เอง
        await interaction.reply({ content: `✅ เพิ่มสคริปต์ **${name}** เรียบร้อย! Panel หน้าบ้านอัปเดตแล้วค่ะ`, ephemeral: true });
    }

    // Menu Select (ลบ) -> Auto Update Real-time
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_delete') {
        const name = interaction.values[0];
        delete scriptDatabase[name];
        saveDatabase(); // ✨ ตรงนี้จะไปเรียก updateDashboard() เอง
        await interaction.reply({ content: `🗑️ ลบ **${name}** เรียบร้อย! Panel หน้าบ้านอัปเดตแล้วค่ะ`, ephemeral: true });
    }

    // Menu Select (เลือกตัวแก้)
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_select_edit') {
        const name = interaction.values[0];
        client.tempEditTarget = name;
        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${name.substring(0, 30)}`);
        const codeInput = new TextInputBuilder().setCustomId('inp_new_code').setLabel("วางโค้ดใหม่ที่นี่").setStyle(TextInputStyle.Paragraph).setPlaceholder("วางโค้ดใหม่ทับอันเดิมได้เลยค่ะ").setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // Modal Submit (บันทึกแก้)
    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_save') {
        const newCode = interaction.fields.getTextInputValue('inp_new_code');
        const targetName = client.tempEditTarget;
        if (targetName && scriptDatabase[targetName] !== undefined) {
            scriptDatabase[targetName] = newCode;
            saveDatabase();
            await interaction.reply({ content: `✨ อัพเดตโค้ด **${targetName}** เรียบร้อยค่ะ!`, ephemeral: true });
            client.tempEditTarget = null;
        } else {
            await interaction.reply({ content: `❌ ผิดพลาด! หาชื่อไม่เจอ`, ephemeral: true });
        }
    }
});

client.login(TOKEN);
