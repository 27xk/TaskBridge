package com.taskbridge.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.ExperimentalRoomApi
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import java.util.concurrent.TimeUnit

@Database(
    entities = [TaskEntity::class, SyncQueueEntity::class],
    version = 4,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun syncQueueDao(): SyncQueueDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        @OptIn(ExperimentalRoomApi::class)
        fun getInstance(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "taskbridge.db",
                )
                    .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                    .setAutoCloseTimeout(5, TimeUnit.MINUTES)
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
                    .build()
                    .also { instance = it }
            }
        }

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE tasks ADD COLUMN project TEXT")
                db.execSQL("ALTER TABLE tasks ADD COLUMN listType TEXT NOT NULL DEFAULT 'inbox'")
                db.execSQL("ALTER TABLE tasks ADD COLUMN plannedDate TEXT")
                db.execSQL("ALTER TABLE tasks ADD COLUMN completedAt TEXT")
                db.execSQL("ALTER TABLE tasks ADD COLUMN snoozedUntil TEXT")
                db.execSQL("ALTER TABLE tasks ADD COLUMN parentServerId INTEGER")
                db.execSQL("ALTER TABLE tasks ADD COLUMN checklistJson TEXT NOT NULL DEFAULT '[]'")
                db.execSQL("ALTER TABLE tasks ADD COLUMN isTemplate INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE tasks ADD COLUMN templateName TEXT")
                db.execSQL("ALTER TABLE tasks ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_tasks_listType ON tasks(listType)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_tasks_plannedDate ON tasks(plannedDate)")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN project TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN listType TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN plannedDate TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN completedAt TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN snoozedUntil TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN parentServerId INTEGER")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN checklistJson TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN isTemplate INTEGER")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN templateName TEXT")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN sortOrder INTEGER")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE INDEX IF NOT EXISTS index_tasks_isDeleted_updatedAt ON tasks(isDeleted, updatedAt)")
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_tasks_isDeleted_dueTime_remindTime_plannedDate " +
                        "ON tasks(isDeleted, dueTime, remindTime, plannedDate)",
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_tasks_status_priority ON tasks(status, priority)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_queue_createdAt_id ON sync_queue(createdAt, id)")
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_sync_queue_attemptCount_createdAt " +
                        "ON sync_queue(attemptCount, createdAt)",
                )
            }
        }
    }
}
