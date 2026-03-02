import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

// GET /api/admin/partners - List all partners
export async function GET(req: Request) {
    try {
        const collection = await getCollection(COLLECTIONS.COMPANIES)
        const partners = await collection.find({}).sort({ createdAt: -1 }).toArray()

        return NextResponse.json({
            success: true,
            partners: partners.map(p => ({
                ...p,
                _id: p._id.toString()
            }))
        })
    } catch (error) {
        console.error("Error fetching partners:", error)
        return NextResponse.json({ success: false, error: "Failed to fetch partners" }, { status: 500 })
    }
}

// POST /api/admin/partners - Create a new partner
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { name, logo, industry, size, location, description, website, verified, benefits } = body

        if (!name || !industry) {
            return NextResponse.json({ success: false, error: "Name and Industry are required" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.COMPANIES)
        const newPartner = {
            name,
            logo: logo || "/placeholder.svg",
            industry,
            size: size || "N/A",
            location: location || "N/A",
            description: description || "",
            website: website || "",
            verified: verified ?? true,
            benefits: benefits || [],
            openPositions: 0,
            rating: 5.0,
            createdAt: new Date().toISOString()
        }

        const result = await collection.insertOne(newPartner)

        return NextResponse.json({
            success: true,
            partner: { ...newPartner, _id: result.insertedId.toString() }
        })
    } catch (error) {
        console.error("Error creating partner:", error)
        return NextResponse.json({ success: false, error: "Failed to create partner" }, { status: 500 })
    }
}
