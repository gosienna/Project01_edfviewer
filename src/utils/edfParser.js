function readAscii(bytes, start, length) {
  return new TextDecoder('ascii').decode(bytes.slice(start, start + length)).trim()
}

function readInt(bytes, start, length) {
  return parseInt(readAscii(bytes, start, length), 10) || 0
}

function readFloat(bytes, start, length) {
  return parseFloat(readAscii(bytes, start, length)) || 0
}

function digitalToPhysical(digital, channel) {
  const digRange = channel.digitalMax - channel.digitalMin
  const physRange = channel.physicalMax - channel.physicalMin
  if (digRange === 0) return channel.physicalMin
  return ((digital - channel.digitalMin) / digRange) * physRange + channel.physicalMin
}

export async function parseEdfFile(source) {
  const buffer = source instanceof ArrayBuffer
    ? source
    : await source.arrayBuffer()

  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  const header = {
    version: readAscii(bytes, 0, 8),
    patient: readAscii(bytes, 8, 80),
    recording: readAscii(bytes, 88, 80),
    startDate: readAscii(bytes, 168, 8),
    startTime: readAscii(bytes, 176, 8),
    headerBytes: readInt(bytes, 184, 8),
    reserved: readAscii(bytes, 192, 44),
    numRecords: readInt(bytes, 236, 8),
    duration: readFloat(bytes, 244, 8),
    numSignals: readInt(bytes, 252, 4),
  }

  const numSignals = header.numSignals
  const base = 256

  const readFieldBlock = (fieldOffset, fieldLength) =>
    Array.from({ length: numSignals }, (_, i) =>
      readAscii(bytes, base + numSignals * fieldOffset + i * fieldLength, fieldLength)
    )

  const labels = readFieldBlock(0, 16)
  const transducers = readFieldBlock(16, 80)
  const physicalDimensions = readFieldBlock(96, 8)
  const physicalMins = readFieldBlock(104, 8).map(Number)
  const physicalMaxs = readFieldBlock(112, 8).map(Number)
  const digitalMins = readFieldBlock(120, 8).map((v) => parseInt(v, 10) || 0)
  const digitalMaxs = readFieldBlock(128, 8).map((v) => parseInt(v, 10) || 0)
  const prefilterings = readFieldBlock(136, 80)
  const samplesPerRecord = readFieldBlock(216, 8).map((v) => parseInt(v, 10) || 0)

  const channels = labels.map((label, index) => ({
    id: index,
    label,
    transducer: transducers[index],
    physicalDimension: physicalDimensions[index],
    physicalMin: physicalMins[index],
    physicalMax: physicalMaxs[index],
    digitalMin: digitalMins[index],
    digitalMax: digitalMaxs[index],
    prefiltering: prefilterings[index],
    samplesPerRecord: samplesPerRecord[index],
    sampleRate: header.duration > 0 ? samplesPerRecord[index] / header.duration : 0,
    data: [],
  }))

  const expectedDataBytes = channels.reduce(
    (sum, channel) => sum + header.numRecords * channel.samplesPerRecord * 2,
    0
  )
  const expectedFileBytes = header.headerBytes + expectedDataBytes
  if (expectedFileBytes > buffer.byteLength) {
    throw new Error(
      `Invalid EDF file: header expects ${expectedFileBytes} bytes but only ${buffer.byteLength} bytes are available`
    )
  }

  let offset = header.headerBytes
  for (let record = 0; record < header.numRecords; record += 1) {
    for (let channelIndex = 0; channelIndex < numSignals; channelIndex += 1) {
      const channel = channels[channelIndex]
      for (let sample = 0; sample < channel.samplesPerRecord; sample += 1) {
        const digital = view.getInt16(offset, true)
        offset += 2
        channel.data.push(digitalToPhysical(digital, channel))
      }
    }
  }

  return {
    header,
    totalDuration: header.numRecords * header.duration,
    channels,
    isEdfPlus: header.reserved.startsWith('EDF'),
  }
}
