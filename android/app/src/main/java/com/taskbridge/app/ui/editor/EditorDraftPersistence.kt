package com.taskbridge.app.ui.editor

import android.content.Context
import com.google.gson.Gson
import java.io.File

data class EditorSavedStateReference(
    val draftId: String,
    val editingLocalId: String?,
)

fun editorSavedStateReference(draftId: String, editingLocalId: String?): EditorSavedStateReference {
    require(draftId.matches(Regex("[A-Za-z0-9-]+"))) { "invalid draft id" }
    return EditorSavedStateReference(draftId, editingLocalId)
}

data class StoredEditorDraft(
    val stateJson: String,
    val snapshotJson: String,
)

interface EditorDraftStore {
    suspend fun read(draftId: String): StoredEditorDraft?
    suspend fun write(draftId: String, draft: StoredEditorDraft)
    suspend fun delete(draftId: String)
}

class FileEditorDraftStore(context: Context) : EditorDraftStore {
    private val directory = File(context.noBackupFilesDir, "editor-drafts")
    private val gson = Gson()

    override suspend fun read(draftId: String): StoredEditorDraft? {
        val file = fileFor(draftId)
        if (!file.isFile) return null
        return runCatching { gson.fromJson(file.readText(Charsets.UTF_8), StoredEditorDraft::class.java) }
            .getOrNull()
    }

    override suspend fun write(draftId: String, draft: StoredEditorDraft) {
        if (!directory.exists() && !directory.mkdirs() && !directory.isDirectory) {
            throw IllegalStateException("editor draft directory unavailable")
        }
        val destination = fileFor(draftId)
        val temporary = File(directory, "${destination.name}.tmp")
        temporary.writeText(gson.toJson(draft), Charsets.UTF_8)
        if (!temporary.renameTo(destination)) {
            destination.delete()
            if (!temporary.renameTo(destination)) throw IllegalStateException("editor draft write failed")
        }
    }

    override suspend fun delete(draftId: String) {
        fileFor(draftId).delete()
        File(directory, "$draftId.json.tmp").delete()
    }

    private fun fileFor(draftId: String): File {
        editorSavedStateReference(draftId, null)
        return File(directory, "$draftId.json")
    }
}
