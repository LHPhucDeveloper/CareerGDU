import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

export async function GET() {
    try {
        // In real app, check auth here!
        const collection = await getCollection(COLLECTIONS.CONTACTS)
        const contacts = await collection.find().sort({ createdAt: -1 }).toArray()

        return NextResponse.json({
            success: true,
            data: contacts
        })
    } catch (error) {
        console.error("Fetch contacts error:", error)
        return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
    }
}
