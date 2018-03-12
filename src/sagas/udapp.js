import EthAbi from 'ethjs-abi'
import _ from 'lodash'

import { select, put, call, takeEvery } from 'redux-saga/effects'
import { SEND_TRANSACTION, CALL_REQUESTED } from '../actions/constants'

import {
  selectEthjs,
  selectAccount,
  selectRegistry,
  selectVoting,
  selectToken,
} from '../selectors'

import { getListingHash } from 'utils/_values'
import { commitVoteSaga, revealVoteSaga, requestVotingRightsSaga } from './vote'
import { txnMined } from '../actions'
import { ipfsAddSaga } from './ipfs'

function* callUDappSaga(action) {
  console.log('call requested:', action)
  const ethjs = yield select(selectEthjs)
  const account = yield select(selectAccount)
  const { method, args, contract } = action.payload

  let c
  if (contract === 'registry') {
    c = yield select(selectRegistry)
  } else if (contract === 'voting') {
    c = yield select(selectVoting)
  }

  // hash the string
  if (method.inputs[0].name === '_listingHash') {
    args[0] = getListingHash(args[0])
  }
  const txData = yield call(EthAbi.encodeMethod, method, args)

  const payload = {
    from: account,
    to: c.address,
    data: txData,
  }

  const result = yield call(ethjs.call, payload, 'latest')
  const decint = parseInt(result, 10)
  const hexint = parseInt(result, 16)
  console.log('CALL result (dec):', decint)
  console.log('CALL result (hex):', hexint)

  const callResult = hexint === 0 ? 'false' : hexint === 1 ? 'true' : decint
  alert(callResult)
}

export default function* udappSaga() {
  yield takeEvery(SEND_TRANSACTION, handleSendTransaction)
  yield takeEvery(CALL_REQUESTED, callUDappSaga)
}

// TODO: write tests for these sagas. against abis
function* handleSendTransaction(action) {
  const methodName = action.payload.methodName
  if (
    methodName === 'apply' ||
    methodName === 'challenge' ||
    methodName === 'updateStatus'
  ) {
    yield call(registryTxnSaga, action)
  } else if (methodName === 'requestVotingRights') {
    yield call(requestVotingRightsSaga, action)
  } else if (methodName === 'commitVote') {
    yield call(commitVoteSaga, action)
  } else if (methodName === 'revealVote') {
    yield call(revealVoteSaga, action)
  } else {
    yield call(sendContractTxn, action)
  }
}

function* registryTxnSaga(action) {
  const registry = yield select(selectRegistry)
  const methodName = action.payload.methodName

  let args = action.payload.args.map(arg => {
    if (_.isObject(arg)) {
      return arg.toString()
    } else if (_.isString(arg)) {
      return arg
    }
    // TODO: more typechecking
    return arg
  })

  if (methodName === 'apply') {
    const fileHash = yield call(ipfsAddSaga, {
      payload: { id: args[0], data: args[2] },
    })
    // hash the string
    args[0] = getListingHash(args[0])
    // use ipfs CID as the _data field in the application
    args[2] = fileHash
  }

  yield call(sendTransactionSaga, registry, methodName, args)
  // const txData = EthAbi.encodeMethod(action.payload.method, action.payload.args)
  // const to = registry.address
  // yield call(sendTransactionSaga, txData, to)
}

export function* sendContractTxn(action) {
  try {
    const { methodName, args, contract } = action.payload
    let c
    if (contract === 'registry') {
      c = yield select(selectRegistry)
    } else if (contract === 'voting') {
      c = yield select(selectVoting)
    } else if (contract === 'token') {
      c = yield select(selectToken)
    }
    if (methodName === 'approve') {
      c = yield select(selectToken)
    }
    const receipt = yield call(sendTransactionSaga, c, methodName, args)
    console.log('receipt', receipt)
  } catch (error) {
    console.log('error', error)
  }
}

export function* sendTransactionSaga(contract, method, args) {
  try {
    const newArgs = args.map(rg => {
      if (_.isObject(rg)) {
        return rg.toString(10)
      } else if (_.isString(rg)) {
        return rg
      }
      return rg
    })

    const receipt = yield call(contract[method], ...newArgs)

    if (receipt.receipt.status !== '0x00') {
      yield put(txnMined(receipt))
    } else {
      console.log('ERROR')
    }
    console.log('receipt', receipt)
    return receipt
  } catch (error) {
    console.log('error', error)
  }
}

// on hold
// export function* sendEthjsTransactionSaga(data, to) {
//   try {
//     const ethjs = yield select(selectEthjs)
//     const from = yield select(selectAccount)
//     const nonce = yield call(ethjs.getTransactionCount, from)
//     const payload = {
//       to,
//       from,
//       gas: 450000,
//       gasPrice: 25000000000,
//       nonce,
//       data,
//     }
//     const txHash = yield call(ethjs.sendTransaction, payload)
//     return txHash
//   } catch (error) {
//     console.log('error', error)
//   }
// }
