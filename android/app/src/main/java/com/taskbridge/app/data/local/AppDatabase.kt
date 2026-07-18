package com.taskbridge.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.ExperimentalRoomApi
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import java.util.concurrent.TimeUnit

const val APP_DATABASE_VERSION = 7

@Database(
    entities = [TaskEntity::class, SyncQueueEntity::class],
    version = APP_DATABASE_VERSION,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun syncQueueDao(): SyncQueueDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        @androidx.annotation.OptIn(ExperimentalRoomApi::class)
        fun getInstance(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "taskbridge.db",
                )
                    .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                    .setAutoCloseTimeout(5, TimeUnit.MINUTES)
                    .addMigrations(
                        MIGRATION_1_2,
                        MIGRATION_2_3,
                        MIGRATION_3_4,
                        MIGRATION_4_5,
                        MIGRATION_5_6,
                        MIGRATION_6_7,
                    )
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

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE tasks ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT 'legacy'")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN ownerUserId TEXT NOT NULL DEFAULT 'legacy'")
                db.execSQL("DROP INDEX IF EXISTS index_tasks_serverId")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_tasks_ownerUserId ON tasks(ownerUserId)")
                db.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_tasks_ownerUserId_serverId " +
                        "ON tasks(ownerUserId, serverId)",
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_queue_ownerUserId ON sync_queue(ownerUserId)")
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_sync_queue_ownerUserId_localId " +
                        "ON sync_queue(ownerUserId, localId)",
                )
            }
        }

        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE tasks ADD COLUMN conflictServerJson TEXT")
                db.execSQL("ALTER TABLE tasks ADD COLUMN conflictLocalJson TEXT")
            }
        }

        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE tasks ADD COLUMN workspaceId TEXT NOT NULL DEFAULT 'legacy'")
                db.execSQL("ALTER TABLE sync_queue ADD COLUMN workspaceId TEXT NOT NULL DEFAULT 'legacy'")
                db.execSQL("UPDATE tasks SET workspaceId = 'legacy:' || ownerUserId")
                db.execSQL("UPDATE sync_queue SET workspaceId = 'legacy:' || ownerUserId")
                db.execSQL("DROP INDEX IF EXISTS index_tasks_ownerUserId_serverId")
                db.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS index_tasks_workspaceId_serverId " +
                        "ON tasks(workspaceId, serverId)",
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_tasks_workspaceId_localId " +
                        "ON tasks(workspaceId, localId)",
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_tasks_workspaceId ON tasks(workspaceId)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_sync_queue_workspaceId ON sync_queue(workspaceId)")
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_sync_queue_workspaceId_localId " +
                        "ON sync_queue(workspaceId, localId)",
                )
            }
        }
    }
}
