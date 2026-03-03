import fs from "fs"
import path from "path"
import { v4 as uuidv4 } from "uuid"
import { getCollection, COLLECTIONS, connectToDatabase } from "./connection"

/**
 * Hàm hỗ trợ lưu Base64 thành file
 */
async function convertBase64ToFile(base64: string, subDir: string): Promise<string | null> {
    if (!base64 || !base64.startsWith("data:")) return null

    try {
        const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
        if (!matches || matches.length !== 3) return null

        const contentType = matches[1]
        const extension = contentType.split("/")[1]?.split("+")[0] || "png"
        const buffer = Buffer.from(matches[2], "base64")

        const fileName = `${uuidv4()}.${extension}`
        const uploadDir = path.join(process.cwd(), "public", "uploads", subDir)

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        const filePath = path.join(uploadDir, fileName)
        fs.writeFileSync(filePath, buffer)

        return `/uploads/${subDir}/${fileName}`
    } catch (error) {
        console.error(`  [Migration] Error converting base64 in ${subDir}:`, error)
        return null
    }
}

async function runMigration() {
    const { client } = await connectToDatabase()
    console.log("🚀 Bắt đầu chuyển đổi dữ liệu Base64 cũ sang Local Storage...")

    try {
        // 1. CHUYỂN ĐỔI AVATAR NGƯỜI DÙNG
        console.log("\n1. Đang xử lý Avatar người dùng...")
        const usersCol = await getCollection(COLLECTIONS.USERS)
        const users = await usersCol.find({ avatar: { $regex: /^data:/ } }).toArray()
        console.log(`   Tìm thấy ${users.length} người dùng có avatar Base64.`)
        for (const user of users) {
            const newPath = await convertBase64ToFile(user.avatar, "avatars")
            if (newPath) {
                await usersCol.updateOne({ _id: user._id }, { $set: { avatar: newPath } })
                console.log(`   - Cập nhật xong: ${user.name || user.email}`)
            }
        }

        // 2. CHUYỂN ĐỔI HERO SLIDES
        console.log("\n2. Đang xử lý Hero Slides...")
        const slidesCol = await getCollection(COLLECTIONS.HERO_SLIDES)
        const slides = await slidesCol.find({ image: { $regex: /^data:/ } }).toArray()
        console.log(`   Tìm thấy ${slides.length} slides có ảnh Base64.`)
        for (const slide of slides) {
            const newPath = await convertBase64ToFile(slide.image, "slides")
            if (newPath) {
                await slidesCol.updateOne({ _id: slide._id }, { $set: { image: newPath } })
                console.log(`   - Cập nhật xong slide: ${slide.title}`)
            }
        }

        // 3. CHUYỂN ĐỔI LOGO CÔNG TY
        console.log("\n3. Đang xử lý Logo đối tác/công ty...")
        const companiesCol = await getCollection(COLLECTIONS.COMPANIES)
        const companies = await companiesCol.find({ logo: { $regex: /^data:/ } }).toArray()
        console.log(`   Tìm thấy ${companies.length} công ty có logo Base64.`)
        for (const company of companies) {
            const newPath = await convertBase64ToFile(company.logo, "logos")
            if (newPath) {
                await companiesCol.updateOne({ _id: company._id }, { $set: { logo: newPath } })
                console.log(`   - Cập nhật xong công ty: ${company.name}`)
            }
        }

        // 4. CHUYỂN ĐỔI LOGO TRONG JOBS (Nếu có lưu riêng)
        console.log("\n4. Đang xử lý Logo trong Jobs...")
        const jobsCol = await getCollection(COLLECTIONS.JOBS)
        const jobs = await jobsCol.find({ logo: { $regex: /^data:/ } }).toArray()
        console.log(`   Tìm thấy ${jobs.length} tin tuyển dụng có logo Base64.`)
        for (const job of jobs) {
            const newPath = await convertBase64ToFile(job.logo, "logos")
            if (newPath) {
                await jobsCol.updateOne({ _id: job._id }, { $set: { logo: newPath } })
                console.log(`   - Cập nhật xong job: ${job.title}`)
            }
        }

        // 5. CHUYỂN ĐỔI CV TRONG APPLICATIONS
        console.log("\n5. Đang xử lý CV trong Applications...")
        const appsCol = await getCollection(COLLECTIONS.APPLICATIONS)
        const apps = await appsCol.find({ cvBase64: { $regex: /^data:/ } }).toArray()
        console.log(`   Tìm thấy ${apps.length} ứng tuyển có CV Base64.`)
        for (const app of apps) {
            const newPath = await convertBase64ToFile(app.cvBase64, "cvs")
            if (newPath) {
                await appsCol.updateOne({ _id: app._id }, { $set: { cvBase64: newPath } })
                console.log(`   - Cập nhật xong CV của: ${app.fullname}`)
            }
        }

        console.log("\n✅ Chuyển đổi dữ liệu hoàn tất!")

    } catch (error) {
        console.error("❌ Lỗi Migration:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

runMigration()
