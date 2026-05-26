import TelegramBot from 'node-telegram-bot-api'

const token = '8150213101:AAFfkqu32aWImOfIaarnQqtWaUj8ZoAwHLE'
const bot = new TelegramBot(token, { polling: true })

export default bot
