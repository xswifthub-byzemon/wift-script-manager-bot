const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- ⚙️ ตั้งค่าส่วนตัวของซีม่อน ---
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = 'ไอดี_ของ_ซีม่อน_ใส่ตรงนี้'; // ⚠️ สำคัญมาก! ต้องใส่ ID ซีม่อนนะ
const DB_FILE = './scripts.json';

// โหลดข้อมูลสคริปต์
let scriptDatabase = {};
if (fs.existsSync(DB_FILE)) {
    scriptDatabase = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(scriptDatabase, null, 4));
}

client.once('ready', () => {
    console.log(`น้องปายพร้อมเสิร์ฟสคริปต์แล้วค่ะ! Logged in as ${client.user.tag}`);
});

// --- 1. คำสั่งเรียก Panel ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 🟢 Panel สำหรับสมาชิก (เลือกสคริปต์)
    if (message.content === '!getscript') {
        const options = Object.keys(scriptDatabase).map(key => ({
            label: key,
            value: key,
            description: 'คลิกเพื่อรับสคริปต์นี้',
            emoji: '📜'
        }));

        if (options.length === 0) {
            return message.reply('ตอนนี้ยังไม่มีสคริปต์ในคลังเลยค่ะซีม่อน เติมก่อนน้า~');
        }

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_script_user')
                .setPlaceholder('เลือกสคริปต์ที่ต้องการเลยค่ะ...')
                .addOptions(options)
        );

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📂 Swift Script Hub')
            .setDescription('เลือกสคริปต์จากเมนูด้านล่าง น้องปายจะส่งโค้ดให้ทันทีค่ะ!');

        await message.channel.send({ embeds: [embed], components: [row] });
    }

    // 🔴 Panel หลังบ้าน (สำหรับซีม่อนคนเดียว)
    if (message.content === '!admin') {
        if (message.author.id !== OWNER_ID) return message.reply('อุ๊บส์! คำสั่งนี้สำหรับซีม่อนสุดหล่อคนเดียวค่ะ 🤫');

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔧 Admin Control Panel')
            .setDescription('จัดการคลังสคริปต์ของซีม่อน');

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

        await interaction.reply({
            content: `**${scriptName}** มาแล้วค่ะ! 👇\n\`\`\`lua\n${scriptCode}\n\`\`\``,
            ephemeral: true // เห็นคนเดียว
        });
    }

    // --- ส่วนของ Admin (ต้องเช็ค ID อีกรอบเพื่อความชัวร์) ---
    if (interaction.user.id !== OWNER_ID) return;

    // 1. ปุ่มเติมสคริปต์ (เปิด Modal)
    if (interaction.isButton() && interaction.customId === 'btn_add') {
        const modal = new ModalBuilder().setCustomId('modal_add').setTitle('เพิ่มสคริปต์ใหม่');
        
        const nameInput = new TextInputBuilder().setCustomId('inp_name').setLabel("ชื่อสคริปต์").setStyle(TextInputStyle.Short);
        const codeInput = new TextInputBuilder().setCustomId('inp_code').setLabel("โค้ดสคริปต์").setStyle(TextInputStyle.Paragraph);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // 2. ปุ่มเช็คสคริปต์
    if (interaction.isButton() && interaction.customId === 'btn_check') {
        const scriptList = Object.keys(scriptDatabase).join('\n- ') || 'ไม่มีสคริปต์เลยค่ะ';
        await interaction.reply({ content: `**รายการสคริปต์ทั้งหมด:**\n- ${scriptList}`, ephemeral: true });
    }

    // 3. ปุ่มลบสคริปต์ (แสดงเมนูเลือก)
    if (interaction.isButton() && interaction.customId === 'btn_delete') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k }));
        if (options.length === 0) return interaction.reply({ content: 'ไม่มีอะไรให้ลบเลยค่ะ', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('menu_delete').setPlaceholder('เลือกตัวที่จะลบ').addOptions(options)
        );
        await interaction.reply({ content: 'เลือกสคริปต์ที่จะลบเลยค่ะ:', components: [row], ephemeral: true });
    }

    // 4. ปุ่มแก้ไขสคริปต์ (แสดงเมนูเลือก)
    if (interaction.isButton() && interaction.customId === 'btn_edit') {
        const options = Object.keys(scriptDatabase).map(k => ({ label: k, value: k }));
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
        const oldCode = scriptDatabase[name];

        const modal = new ModalBuilder().setCustomId('modal_edit_save').setTitle(`แก้ไข: ${name}`);
        // ส่งชื่อเดิมไปด้วยผ่าน CustomId หรือเก็บไว้ แต่ในที่นี้เราแก้โค้ดอย่างเดียว
        // หมายเหตุ: Discord Modal ไม่ให้ส่งค่า Default เกิน 4000 ตัวอักษร ถ้าโค้ดยาวมากอาจจะใส่ใน value ไม่ได้
        // ปายจะทำแบบช่องว่างให้วางโค้ดใหม่ทับไปเลยนะเพื่อกัน Error
        
        const codeInput = new TextInputBuilder()
            .setCustomId('inp_new_code')
            .setLabel("วางโค้ดใหม่ที่นี่")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("วางโค้ดใหม่ทับอันเดิมได้เลยค่ะ")
            .setRequired(true);

        // แอบส่งชื่อสคริปต์ผ่าน ID ของ Input ไม่ได้ ต้องใช้วิธีอื่น
        // แต่ง่ายสุดคือ ปายจะขอให้ซีม่อนยืนยันชื่อใน Modal Title แล้วเราใช้ตัวแปร global หรือ cache ชั่วคราว
        // เพื่อความง่าย ปายจะใช้วิธีแยก CustomID ให้มีชื่อสคริปต์ติดไปด้วย (แต่ต้องระวังชื่อยาวเกิน)
        // **วิธีแก้ปัญหาที่ง่ายที่สุด:** ปายให้ซีม่อนวางโค้ดใหม่ แล้วปายจะอัพเดตตัวที่เลือกไว้ล่าสุด (วิธีนี้ซับซ้อนน้อยสุดสำหรับโค้ดไฟล์เดียว)
        
        client.tempEditTarget = name; // ⚠️ วิธีนี้ใช้ได้กรณีรันคนเดียว ถ้าหลายคนใช้พร้อมกันอาจรวน แต่ซีม่อนใช้คนเดียว สบายมาก!

        modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
        await interaction.showModal(modal);
    }

    // รับค่าจาก Modal บันทึกการแก้ไข
    if (interaction.isModalSubmit() && interaction.customId === 'modal_edit_save') {
        const newCode = interaction.fields.getTextInputValue('inp_new_code');
        const targetName = client.tempEditTarget;

        if (targetName && scriptDatabase[targetName]) {
            scriptDatabase[targetName] = newCode;
            saveDatabase();
            await interaction.reply({ content: `✨ อัพเดตโค้ดของ **${targetName}** เรียบร้อยค่ะ!`, ephemeral: true });
            client.tempEditTarget = null;
        } else {
            await interaction.reply({ content: `❌ เกิดข้อผิดพลาด หาชื่อสคริปต์ไม่เจอค่ะ ลองใหม่น้า`, ephemeral: true });
        }
    }
});

client.login(TOKEN);
