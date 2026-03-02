import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import bcrypt from "bcryptjs"

// Demo users to seed
const demoUsers = [
    {
        email: "admin@gdu.edu.vn",
        password: "admin123",
        name: "Admin GDU",
        role: "admin",
        phone: "0909123456",
        avatar: "", // Empty to show initials
    },
    {
        email: "student@gdu.edu.vn",
        password: "student123",
        name: "Nguyen Van A",
        role: "student",
        phone: "0909234567",
        studentId: "GDU2024001",
        major: "Công nghệ thông tin",
        avatar: "", // Empty to show initials
    },
    {
        email: "employer@company.com",
        password: "employer123",
        name: "Tran Thi B",
        role: "employer",
        phone: "0909345678",
        avatar: "", // Empty to show initials
    },
]

export async function GET() {
    try {
        const collection = await getCollection(COLLECTIONS.USERS)
        const results = []

        for (const user of demoUsers) {
            // Check if user already exists
            const existing = await collection.findOne({ email: user.email })

            if (existing) {
                // Update with new hashed password
                const hashedPassword = await bcrypt.hash(user.password, 10)
                await collection.updateOne(
                    { email: user.email },
                    {
                        $set: {
                            password: hashedPassword,
                            name: user.name,
                            role: user.role,
                            phone: user.phone,
                            avatar: user.avatar,
                            ...(user.role === "student" && {
                                studentId: user.studentId,
                                major: user.major,
                            }),
                            updatedAt: new Date(),
                        }
                    }
                )
                results.push({ email: user.email, status: "updated" })
            } else {
                // Create new user
                const hashedPassword = await bcrypt.hash(user.password, 10)
                const { password, ...userWithoutPassword } = user
                await collection.insertOne({
                    ...userWithoutPassword,
                    password: hashedPassword,
                    createdAt: new Date(),
                })
                results.push({ email: user.email, status: "created" })
            }
        }

        return NextResponse.json({
            success: true,
            message: "Demo users seeded successfully",
            results,
        })
    } catch (error) {
        console.error("Seed error:", error)
        return NextResponse.json({ error: "Failed to seed demo users" }, { status: 500 })
    }
}
