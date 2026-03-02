import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get("file") as File
        const userId = formData.get("userId") as string

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
        }

        if (!userId) {
            return NextResponse.json({ error: "Missing user ID" }, { status: 400 })
        }

        // Validate file type
        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
        if (!validTypes.includes(file.type)) {
            return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, WEBP, GIF allowed." }, { status: 400 })
        }

        // Validate file size (max 2MB for Base64 storage)
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large. Max 2MB allowed." }, { status: 400 })
        }

        // Convert file to Base64 data URL
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const base64 = buffer.toString("base64")
        const avatarUrl = `data:${file.type};base64,${base64}`

        // Update user in MongoDB with Base64 avatar
        const collection = await getCollection(COLLECTIONS.USERS)
        await collection.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { avatar: avatarUrl, updatedAt: new Date() } }
        )

        return NextResponse.json({
            success: true,
            url: avatarUrl,
            message: "Avatar uploaded successfully"
        })

    } catch (error) {
        console.error("[API] Upload error:", error)
        return NextResponse.json({ error: "Upload failed" }, { status: 500 })
    }
}
