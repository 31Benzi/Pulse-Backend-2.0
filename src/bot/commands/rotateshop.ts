import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { rotateShop } from "../../services/shopRotator";

export const rotateshopCommand = {
  data: new SlashCommandBuilder()
    .setName("rotateshop")
    .setDescription("Manually rotate the item shop")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction) {
        const member = interaction.member
        if (!member || !("permissions" in member) || !(member.permissions as any).has(PermissionFlagsBits.Administrator)) {
            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("Access Denied")
                .setDescription("You must be an **Administrator** to use this command.")
                .setTimestamp()
            await interaction.reply({ embeds: [embed], flags: 64 })
            return { success: false, reason: "Access denied" }
        }

    await interaction.deferReply({ flags: 64 });

    try {
      const success = await rotateShop();

      if (success) {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("Shop Rotated")
          .setDescription("Item shop has been rotated successfully!")
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("Rotation Failed")
          .setDescription("Failed to rotate item shop. Check server logs for details.")
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return { success: false, reason: "Shop rotation failed" };
      }
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle("Error")
        .setDescription(`Error rotating shop: ${error}`)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return { success: false, reason: "Server error" };
    }
  }
};
