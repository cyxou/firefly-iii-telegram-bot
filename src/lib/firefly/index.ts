import axios from 'axios'
import dayjs from 'dayjs'
import debug from 'debug'

import * as api from './api'
import { Configuration } from './configuration'

const rootLog = debug(`lib:firefly`)

import { getUserStorage } from '../storage'


export default function firefly(userId: number) {
  const { fireflyUrl, fireflyAccessToken } = getUserStorage(userId)
  const configuration = new Configuration({
    accessToken: fireflyAccessToken,
    basePath: fireflyUrl.replace(/\/+$/, ""),
    // baseOptions: {
    //   transformResponse: [function (data: any) {
    //     // Do whatever you want to transform the data
    //     console.log('ALOHA', data)
    //
    //     return data
    //   }]
    // }
  })

  return {
    About: api.AboutApiFactory(configuration),
    Accounts: api.AccountsApiFactory(configuration),
    Categories: api.CategoriesApiFactory(configuration),
    Insight: api.InsightApiFactory(configuration),
    Transactions: api.TransactionsApiFactory(configuration),
  }
}

// console.log('api: ', api)
// console.log('configuration: ', configuration)
//
// test()
//
// async function test() {
//   const aboutData = (await api.AboutApiFactory(configuration).getAbout()).data
//   console.log('aboutData: ', aboutData)
//   const currentUser = await api.AboutApiFp(configuration).getCurrentUser()
//   console.log('currentUser: ', await currentUser())
//   // const currentUser = ()
//   // console.log('AboutApi: ',
// }
