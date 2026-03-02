import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const collection = await getCollection(COLLECTIONS.COMPANIES)

        let company;
        // Check if ID is a valid MongoDB ObjectId
        if (ObjectId.isValid(id)) {
            company = await collection.findOne({ _id: new ObjectId(id) })
        } else {
            // Fallback for string IDs if any exist (though we're moving to MongoDB)
            company = await collection.findOne({ id: id })
        }

        if (!company) {
            return NextResponse.json(
                { success: false, error: "Company not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            company: {
                ...company,
                _id: company._id.toString(),
                id: company._id.toString()
            },
        })
    } catch (error) {
        console.error("Error fetching company:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch company" },
            { status: 500 }
        )
    }
}
