import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

// PATCH /api/admin/partners/[id] - Update a partner
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()

        const collection = await getCollection(COLLECTIONS.COMPANIES)

        // Remove _id from body to avoid trying to update it
        const { _id, ...updateData } = body

        const result = await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...updateData, updatedAt: new Date().toISOString() } }
        )

        if (result.matchedCount === 0) {
            return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: "Partner updated successfully" })
    } catch (error) {
        console.error("Error updating partner:", error)
        return NextResponse.json({ success: false, error: "Failed to update partner" }, { status: 500 })
    }
}

// DELETE /api/admin/partners/[id] - Delete a partner
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const collection = await getCollection(COLLECTIONS.COMPANIES)

        const result = await collection.deleteOne({ _id: new ObjectId(id) })

        if (result.deletedCount === 0) {
            return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: "Partner deleted successfully" })
    } catch (error) {
        console.error("Error deleting partner:", error)
        return NextResponse.json({ success: false, error: "Failed to delete partner" }, { status: 500 })
    }
}
