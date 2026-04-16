package ca.rmrobinson.meridian.data.local

import androidx.compose.ui.graphics.Color
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "line_families")
data class LineFamilyEntity(
    @PrimaryKey val id: String,
    val label: String,
    @ColumnInfo(name = "base_color_h") val baseColorH: Int,
    @ColumnInfo(name = "base_color_s") val baseColorS: Int,
    @ColumnInfo(name = "base_color_l") val baseColorL: Int,
    val side: String,           // LineFamilySide enum name
    @ColumnInfo(name = "on_end") val onEnd: String,             // LineFamilyOnEnd enum name
    @ColumnInfo(name = "spawn_behavior") val spawnBehavior: String, // LineFamilySpawnBehavior enum name
)

fun LineFamilyEntity.toColor(darkTheme: Boolean = false): Color {
    val lightnessAdjust = if (darkTheme) 0.15f else 0f
    return Color.hsl(
        hue = baseColorH.toFloat(),
        saturation = baseColorS / 100f,
        lightness = (baseColorL / 100f + lightnessAdjust).coerceIn(0f, 1f),
    )
}
