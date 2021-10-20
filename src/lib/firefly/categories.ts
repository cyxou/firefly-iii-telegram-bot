import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'
import qs from 'qs'

import { getAxiosConfigForUser } from './helpers'

const rootLog = debug(`bot:Firefly:categories`)

export default {
  getCategories,
  getCategory,
  createCategory,
  editCategory,
  deleteCategory,
  getCategoryTransactions
}

async function getCategories(userId: number) {
  const log = rootLog.extend('getCategories')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.get('/categories', config)
    log('categories: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting categories: ', err)
  }
}

async function getCategory(categoryId: string | number, userId: number) {
  const log = rootLog.extend('getCategory')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.get(`/categories/${categoryId}`, config)
    log('category: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting category: ', err)
  }
}

async function getCategoryTransactions(
  categoryId: string | number,
  {
    page = 1,
    start = dayjs().format('YYYY-MM-DD'),
    end = dayjs().format('YYYY-MM-DD'),
    type = 'expense'
  },
  userId: number
) {
  const log = rootLog.extend('getCategory')
  try {
    const config = getAxiosConfigForUser(userId)
    start = dayjs(start).format('YYYY-MM-DD')
    end = dayjs(end).format('YYYY-MM-DD')

    const params = qs.stringify({ page, start, end, type })
    const res = await axios.get(
      `/categories/${categoryId}/transactions?${params}`,
      config
    )
    log('category transactions: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred getting category: ', err)
  }
}

async function createCategory(category: ICategory, userId: number, ) {
  const log = rootLog.extend('createCategory')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.post('/categories', category, config)
    log('category: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred creating a category: ', err)
    throw err
  }
}

async function editCategory(categoryId: string | number, category: ICategory, userId: number, ) {
  const log = rootLog.extend('editCategory')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.put(`/categories/${categoryId}`, category, config)
    log('category: %O', res.data.data)
    return res.data.data
  } catch (err) {
    console.error('Error occurred editing a category: ', err)
    throw err
  }
}

async function deleteCategory(categoryId: number | string, userId: number) {
  const log = rootLog.extend('deleteCategory')
  try {
    const config = getAxiosConfigForUser(userId)
    const res = await axios.delete(`/categories/${categoryId}`, config)
    log('result data: %O', res.data.data)
    return res.data
  } catch (err) {
    console.error('Error occurred deleting category: ', err)
    throw err
  }
}

export type ICategory = {
  name: string,
  notes?: string
  id?: string
}
