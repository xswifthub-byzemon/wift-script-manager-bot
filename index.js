const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- ⚙️ ตั้งค่า (ดึงจาก Railway Variables) ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID; // ✨ แก้ตรงนี้ให้ดึงจาก Railway แล้วค่ะ
const DB_FILE = './scripts.json';

// โหลดข้อมูลสคริปต์ (ถ้ามีไฟล์อยู่แล้ว)
let scriptDatabase = {};
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
}

client.once('ready', () => {
    console.log(`น้องปาย Swift Script Hub พร้อมทำงานแล้วค่ะ! Logged in as ${client.user.tag}`);
});

// --- 1. คำสั่งเรียก Panel ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 🟢 Panel สำหรับสมาชิก (เลือกสคริปต์)
    if (message.content === '!getscript') {
        // เช็คว่ามีสคริปต์ไหม
        const scriptKeys = Object.keys(scriptDatabase);
        
        if (scriptKeys.length === 0) {
            return message.reply('ตอนนี้ยังไม่มีสคริปต์ในคลังเลยค่ะซีม่อน เติมก่อนน้า~ 🥺');
        }

        const options = scriptKeys.map(key => ({
            label: key,
            value: key,
            description: 'คลิกเพื่อรับสคริปต์นี้',
            emoji: '📜'
        }));

        // Select Menu รับได้สูงสุด 25 ตัวเลือก ถ้าเกินต้องตัดออก
        const safeOptions = options.slice(0, 25);

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_script_user')
                .setPlaceholder('เลือกสคริปต์ที่ต้องการเลยค่ะ...')
                .addOptions(safeOptions)
        );

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📂 Swift Script Hub')
            .setDescription('เลือกสคริปต์จากเมนูด้านล่าง น้องปายจะส่งโค้ดให้ทันทีค่ะ!')
            .setFooter({ text: 'Powered by Pai ❤️' });

        await message.channel.send({ embeds: [embed], components: [row] });
    }

    // 🔴 Panel หลังบ้าน (สำหรับซีม่อนคนเดียว)
    if (message.content === '!admin') {
        // เช็ค ID ว่าใช่ซีม่อนไหม
        if (message.author.id !== OWNER_ID) return message.reply('อุ๊บส์! คำสั่งนี้สำหรับซีม่อนสุดหล่อคนเดียวค่ะ 🤫');

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔧 Admin Control Panel')
            .setDescription(`จัดการคลังสคริปต์ของซีม่อน (มีทั้งหมด ${Object.keys(scriptDatabase).length} สคริปต์)`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_add').setLabel('เติมสคริปต์').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('btn_check').setLabel('เช็คสคริปต์').setStyle(ButtonStyle.Primary).setEmoji('👀'),
            new ButtonBuilder().setCustomId('btn_edit').setLabel('แก้ไข').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId('btn_delete').setLabel('ลบสคริปต์').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// --- 2. จัดการ Interaction (ปุ่ม/เมนู) ---
client.on('interactionCreate', async (interaction) => {
    
    // --- ส่วนของ User ทั่วไป ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_script_user') {
        const scriptName = interaction.values[0];
        const scriptCode = scriptDatabase[scriptName];

        if (!scriptCode) {
             return interaction.reply({ content: 'เอ๊ะ! ไม่เจอสคริปต์นี้ สงสัยโดนลบไปแล้วค่ะ', ephemeral: true });
        }

        await interaction.reply({
            content: `**${scriptName}** มาแล้วค่ะ! 👇\n\`\`\`lua\n${scriptCode}\n\`\`\``,
            ephemeral: true // เห็นคนเดียว
        });
    }

    // --- ส่วนของ Admin (เช็ค ID อีกรอบเพื่อความชัวร์) ---
    // ถ้าไม่ใช่ปุ่มหรือเมนูที่เกี่ยวกับ admin ให้ข้ามไป
    if (!['btn_add', 'btn_check', 'btn_edit', 'btn_delete', 'menu_delete', 'menu_select_edit'].includes(interaction.customId) && !interaction.isModalSubmit()) return;

    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: 'หนูไม่รู้จักคุณค่ะ! ให้ซีม่อนใช้ได้คนเดียวนะ', ephemeral: true });
    }

    // 1. ปุ่มเติมสคริปต์ (เปิด Modal)
    if (interaction.isButton() && interaction.customId === 'btn_add') {
        const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์ใหม่');
        
        const nameInput = new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short).setRequired(true);
        const codeInput = new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // 2. ปุ่มเช็คสคริปต์
    if (interaction.isButton() && interaction.customId === 'btn_check') {
        const keys = Object.keys(scriptDatabase);
        const scriptList = keys.length > 0 ? keys.map((k, i) => `${i+1}. ${k}`).join('\n') : 'ว่างเปล่า... ยังไม่มีสคริปต์เลยค่ะ';
        
        // ถ้าข้อความยาวเกิน Discord limit (2000 ตัวอักษร) อาจจะต้องส่งเป็นไฟล์ แต่นี่เอาเบื้องต้นก่อน
        if (scriptList.length > 2000) {
             await interaction.reply({ content: `เยอะจัด! มีทั้งหมด ${keys.length} สคริปต์ค่ะ (แสดงไม่หมด)`, ephemeral: true });
        } else {
             await interaction.reply({ content: `**รายการสคริปต์ในคลัง (${keys.length}):**\n\`\`\`\n${scriptList}\n\`\`\``, ephemeral: true });
        }
    }

    // 3. ปุ่มลบสคริปต์ (แสดงเมนูเลือก)
    if (interaction.isButton() && interaction.customId === 'btn_delete') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้ลบเลยค่ะ', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวที่จะลบ').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะลบเลยค่ะ:', components: [row], ephemeral: true });
    }

    // 4. ปุ่มแก้ไขสคริปต์ (แสดงเมนูเลือก)
    if (interaction.isButton() && interaction.customId === 'btn_edit') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k })).slice(0, 25);
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้แก้เลยค่ะ', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_select_edit').setPlaceholder('เลือกตัวที่จะแก้').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะแก้ไขค่ะ:', components: [row], ephemeral: true });
    }

    // --- จัดการการตอบกลับ Modal และ Menu ของ Admin ---

    // รับค่าจาก Modal เพิ่มสคริปต์
    if (interaction.isModalSubmit() && interaction.customId === 'modal_add') {
        const name = interaction.fields.getTextInputValue('inp_name');
        const code = interaction.fields.getTextInputValue('inp_code');
        
        scriptDatabase[name] = code;
        saveDatabase();
        await interaction.reply({ content: `✅ เพิ่มสคริปต์ **${name}** เรียบร้อยแล้วค่ะ!`, ephemeral: true });
    }

    // รับค่าจาก Menu ลบ
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_delete') {
        const name = interaction.values[0];
        delete scriptDatabase[name];
        saveDatabase();
        await interaction.reply({ content: `🗑️ ลบสคริปต์ **${name}** ออกจากคลังแล้วค่ะ`, ephemeral: true });
    }

    // รับค่าจาก Menu เลือกตัวแก้ -> เด้ง Modal แก้ไข
    if (interaction.isStringSelectMenu() && interaction.customId === 'menu_select_edit') {
        const name = interaction.values[0];
        // เก็บชื่อไว้ชั่วคราวใน client (วิธีนี้ง่ายสุดสำหรับบอทส่วนตัว)
        client.tempEditTarget = name;

        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${name.substring(0, 30)}`); // Title ยาวเกินไม่ได้
        
        const codeInput = new TextInputBuilder()
            .setCustomId('inp_new_code')
            .setLabel("วางโค้ดใหม่ที่นี่")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("วางโค้ดใหม่ทับอันเดิมได้เลยค่ะ")
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // รับค่าจาก Modal บันทึกการแก้ไข
    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_save') {
        const newCode = interaction.fields.getTextInputValue('inp_new_code');
        const targetName = client.tempEditTarget;

        if (targetName && scriptDatabase[targetName] !== undefined) {
            scriptDatabase[targetName] = newCode;
            saveDatabase();
            await interaction.reply({ content: `✨ อัพเดตโค้ดของ **${targetName}** เรียบร้อยค่ะ!`, ephemeral: true });
            client.tempEditTarget = null;
        } else {
            await interaction.reply({ content: `❌ เกิดข้อผิดพลาด! ลองกดแก้ไขใหม่นะคะ`, ephemeral: true });
        }
    }
});

client.login(TOKEN);
