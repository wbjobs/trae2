<template>
  <div class="instrument-calendar">
    <div class="page-header">
      <div class="header-left">
        <el-button icon="el-icon-arrow-left" @click="goBack">返回</el-button>
        <h2 class="page-title">{{ instrument?.name || '预约日历' }}</h2>
        <el-tag v-if="instrument" :type="getStatusType(instrument.status)" size="small">
          {{ instrument.status | instrumentStatusFilter }}
        </el-tag>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="18">
        <div class="card-container">
          <div class="calendar-header">
            <el-button icon="el-icon-arrow-left" size="small" @click="changeDate(-1)">上一周</el-button>
            <span class="date-range">{{ dateRangeText }}</span>
            <el-button icon="el-icon-arrow-right" size="small" @click="changeDate(1)">下一周</el-button>
            <el-button size="small" @click="goToToday">今天</el-button>
          </div>
          <div class="calendar-body">
            <div class="calendar-grid">
              <div class="calendar-header-row">
                <div class="time-header"></div>
                <div
                  v-for="(day, index) in weekDays"
                  :key="index"
                  class="day-header"
                  :class="{ today: isToday(day) }"
                >
                  <p class="day-name">{{ day.dayName }}</p>
                  <p class="day-date">{{ day.dateText }}</p>
                </div>
              </div>
              <div class="calendar-rows">
                <div v-for="(slot, slotIndex) in timeSlots" :key="slotIndex" class="time-row">
                  <div class="time-label">{{ slot.label }}</div>
                  <div
                    v-for="(day, dayIndex) in weekDays"
                    :key="dayIndex"
                    class="slot-cell"
                    :class="{
                      available: isSlotAvailable(day, slot),
                      reserved: isSlotReserved(day, slot),
                      past: isPast(day, slot),
                    }"
                    @click="handleSlotClick(day, slot)"
                  >
                    <div v-if="isSlotReserved(day, slot)" class="slot-info">
                      <p class="slot-user">{{ getReservation(day, slot)?.user_name }}</p>
                      <p class="slot-purpose">{{ getReservation(day, slot)?.purpose | truncate(20) }}</p>
                    </div>
                    <div v-else-if="isPast(day, slot)" class="slot-past">
                      已过期
                    </div>
                    <div v-else class="slot-available">
                      可预约
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="card-container" v-if="instrument">
          <h3>仪器信息</h3>
          <div class="instrument-info">
            <div class="info-row">
              <label>编号：</label>
              <span>{{ instrument.code }}</span>
            </div>
            <div class="info-row">
              <label>型号：</label>
              <span>{{ instrument.model }}</span>
            </div>
            <div class="info-row">
              <label>位置：</label>
              <span>{{ instrument.location }}</span>
            </div>
            <div class="info-row">
              <label>厂商：</label>
              <span>{{ instrument.manufacturer }}</span>
            </div>
            <div class="info-row">
              <label>需审核：</label>
              <span>{{ instrument.requires_approval ? '是' : '否' }}</span>
            </div>
            <div class="info-row">
              <label>日限时长：</label>
              <span>{{ instrument.daily_max_hours }} 小时</span>
            </div>
          </div>
        </div>
        <div class="card-container mt20">
          <h3>预约说明</h3>
          <ul class="reservation-notes">
            <li>请提前24小时预约，如需取消请提前4小时</li>
            <li>首次使用请接受操作培训</li>
            <li>使用完毕请填写使用记录并上传实验数据</li>
            <li>超时使用将影响下次预约权限</li>
          </ul>
        </div>
      </el-col>
    </el-row>

    <el-dialog
      title="提交预约"
      :visible.sync="reserveVisible"
      width="500px"
      append-to-body
      @close="resetForm"
    >
      <el-form
        ref="reserveForm"
        :model="reserveForm"
        :rules="reserveRules"
        label-width="100px"
      >
        <el-form-item label="预约时段">
          <el-input :value="selectedSlotText" disabled />
        </el-form-item>
        <el-form-item label="实验目的" prop="purpose">
          <el-input
            v-model="reserveForm.purpose"
            type="textarea"
            :rows="4"
            placeholder="请详细描述实验目的和内容"
          ></el-input>
        </el-form-item>
        <el-form-item label="预计时长" prop="duration">
          <el-input-number
            v-model="reserveForm.duration"
            :min="0.5"
            :max="8"
            :step="0.5"
            label="小时"
          ></el-input-number>
          <span class="tip">最长预约8小时</span>
        </el-form-item>
        <el-form-item label="样品信息">
          <el-input
            v-model="reserveForm.sample_info"
            placeholder="请描述样品信息（选填）"
          ></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="reserveVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReservation">
          提交预约
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import { getInstrumentDetail, getInstrumentSlots } from '@/api/instrument'
import { createReservation } from '@/api/reservation'

export default defineComponent({
  name: 'InstrumentCalendar',
  filters: {
    truncate(text: string, length: number) {
      if (!text) return ''
      return text.length > length ? text.slice(0, length) + '...' : text
    },
    instrumentStatusFilter(status: string) {
      const statusMap: Record<string, string> = {
        available: '可用',
        in_use: '使用中',
        maintenance: '维护中',
        unavailable: '不可用',
      }
      return statusMap[status] || status
    },
  },
  setup() {
    const instrument = ref<any>(null)
    const weekStart = ref(dayjs().startOf('week'))
    const reserveVisible = ref(false)
    const submitting = ref(false)
    const selectedSlot = ref<any>(null)
    const reservations = ref<any[]>([])

    const reserveForm = reactive({
      purpose: '',
      duration: 1,
      sample_info: '',
    })

    const timeSlots = computed(() => {
      const slots = []
      for (let h = 8; h < 20; h++) {
        slots.push({
          label: `${h.toString().padStart(2, '0')}:00 - ${(h + 1).toString().padStart(2, '0')}:00`,
          startHour: h,
          endHour: h + 1,
        })
      }
      return slots
    })

    const weekDays = computed(() => {
      const days = []
      for (let i = 0; i < 7; i++) {
        const day = weekStart.value.add(i, 'day')
        days.push({
          date: day,
          dayName: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.day()],
          dateText: day.format('MM/DD'),
          dateFull: day.format('YYYY-MM-DD'),
        })
      }
      return days
    })

    const dateRangeText = computed(() => {
      const start = weekStart.value.format('YYYY年MM月DD日')
      const end = weekStart.value.add(6, 'day').format('MM月DD日')
      return `${start} - ${end}`
    })

    const selectedSlotText = computed(() => {
      if (!selectedSlot.value) return ''
      const { day, slot } = selectedSlot.value
      return `${day.dateFull} ${slot.label}`
    })

    const validatePurpose = (rule: any, value: string, callback: any) => {
      if (!value || value.trim().length < 5) {
        return callback(new Error('请填写实验目的（至少5个字）'))
      }
      callback()
    }

    const reserveRules = {
      purpose: [{ validator: validatePurpose, trigger: 'blur' }],
      duration: [{ required: true, message: '请选择预计时长', trigger: 'change' }],
    }

    return {
      instrument,
      weekStart,
      timeSlots,
      weekDays,
      dateRangeText,
      reserveVisible,
      submitting,
      selectedSlot,
      selectedSlotText,
      reserveForm,
      reserveRules,
      reservations,
    }
  },
  mounted() {
    this.fetchInstrumentDetail()
    this.fetchReservations()
  },
  methods: {
    getStatusType(status: string) {
      const typeMap: Record<string, string> = {
        available: 'success',
        in_use: 'primary',
        maintenance: 'warning',
        unavailable: 'danger',
      }
      return typeMap[status] || 'info'
    },
    goBack() {
      this.$router.push('/instruments/list')
    },
    changeDate(offset: number) {
      this.weekStart = this.weekStart.add(offset * 7, 'day')
      this.fetchReservations()
    },
    goToToday() {
      this.weekStart = dayjs().startOf('week')
      this.fetchReservations()
    },
    isToday(day: any) {
      return dayjs().isSame(day.date, 'day')
    },
    isPast(day: any, slot: any) {
      const slotDateTime = day.date.hour(slot.startHour)
      return slotDateTime.isBefore(dayjs())
    },
    isSlotAvailable(day: any, slot: any) {
      return !this.isPast(day, slot) && !this.isSlotReserved(day, slot)
    },
    isSlotReserved(day: any, slot: any) {
      return !!this.getReservation(day, slot)
    },
    getReservation(day: any, slot: any) {
      const slotStart = day.date.hour(slot.startHour).minute(0).second(0)
      const slotEnd = day.date.hour(slot.endHour).minute(0).second(0)

      return this.reservations.find((r: any) => {
        const rStart = dayjs(r.start_time)
        const rEnd = dayjs(r.end_time)
        return slotStart.isBefore(rEnd) && slotEnd.isAfter(rStart)
      })
    },
    async fetchInstrumentDetail() {
      const id = this.$route.params.id
      try {
        const res: any = await getInstrumentDetail(id)
        this.instrument = res.data
      } catch (e) {
        this.instrument = {
          id,
          name: '扫描电子显微镜',
          code: 'SEM-001',
          model: 'Hitachi SU8010',
          manufacturer: 'Hitachi',
          location: 'A楼101室',
          status: 'available',
          description: '高分辨率场发射扫描电子显微镜',
          requires_approval: true,
          daily_max_hours: 8,
        }
      }
    },
    async fetchReservations() {
      const id = this.$route.params.id
      const startDate = this.weekStart.format('YYYY-MM-DD')
      const endDate = this.weekStart.add(6, 'day').format('YYYY-MM-DD')

      try {
        const res: any = await getInstrumentSlots(id, { start_date: startDate, end_date: endDate })
        this.reservations = res.data || []
      } catch (e) {
        this.reservations = [
          {
            id: '1',
            user_name: '张三',
            start_time: this.weekStart.add(1, 'day').hour(9).toISOString(),
            end_time: this.weekStart.add(1, 'day').hour(12).toISOString(),
            purpose: '材料表面形貌观察',
            status: 'approved',
          },
          {
            id: '2',
            user_name: '李四',
            start_time: this.weekStart.add(2, 'day').hour(14).toISOString(),
            end_time: this.weekStart.add(2, 'day').hour(16).toISOString(),
            purpose: '纳米颗粒尺寸分析',
            status: 'approved',
          },
        ]
      }
    },
    handleSlotClick(day: any, slot: any) {
      if (this.isPast(day, slot)) {
        this.$message.warning('该时段已过期')
        return
      }
      if (this.isSlotReserved(day, slot)) {
        const r = this.getReservation(day, slot)
        this.$message.info(`该时段已被 ${r.user_name} 预约`)
        return
      }
      if (this.instrument?.status !== 'available') {
        this.$message.warning('该仪器当前不可预约')
        return
      }
      this.selectedSlot = { day, slot }
      this.reserveVisible = true
    },
    resetForm() {
      this.reserveForm.purpose = ''
      this.reserveForm.duration = 1
      this.reserveForm.sample_info = ''
      this.selectedSlot = null
    },
    async submitReservation() {
      try {
        await (this.$refs.reserveForm as any).validate()
        this.submitting = true

        const { day, slot } = this.selectedSlot
        const start_time = day.date.hour(slot.startHour).minute(0).second(0).toISOString()
        const end_time = day.date.hour(slot.startHour + this.reserveForm.duration).minute(0).second(0).toISOString()

        const data = {
          instrument_id: this.$route.params.id,
          start_time,
          end_time,
          purpose: this.reserveForm.purpose,
          sample_info: this.reserveForm.sample_info,
        }

        await createReservation(data)
        this.$message.success('预约提交成功，' + (this.instrument?.requires_approval ? '请等待管理员审核' : '预约已生效'))
        this.reserveVisible = false
        this.fetchReservations()
      } catch (e) {
        console.error(e)
      } finally {
        this.submitting = false
      }
    },
  },
})
</script>

<style lang="scss" scoped>
.instrument-calendar {
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;

      .page-title {
        font-size: 20px;
        font-weight: 600;
        margin: 0;
        color: $text-primary;
      }
    }
  }

  .calendar-header {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;

    .date-range {
      font-size: 16px;
      font-weight: 500;
      color: $text-primary;
    }
  }

  .calendar-grid {
    border: 1px solid $border-color;
    border-radius: 8px;
    overflow: hidden;

    .calendar-header-row {
      display: grid;
      grid-template-columns: 100px repeat(7, 1fr);
      background: $bg-color;

      .time-header {
        padding: 12px;
        text-align: center;
        font-weight: 600;
        color: $text-regular;
        border-right: 1px solid $border-color;
      }

      .day-header {
        padding: 12px;
        text-align: center;
        border-right: 1px solid $border-color;

        &:last-child {
          border-right: none;
        }

        &.today {
          background: rgba(22, 93, 255, 0.1);

          .day-name,
          .day-date {
            color: $primary-color;
          }
        }

        .day-name {
          font-weight: 600;
          color: $text-regular;
          margin: 0 0 4px 0;
          font-size: 14px;
        }

        .day-date {
          margin: 0;
          font-size: 13px;
          color: $text-secondary;
        }
      }
    }

    .calendar-rows {
      .time-row {
        display: grid;
        grid-template-columns: 100px repeat(7, 1fr);
        border-top: 1px solid $border-color;

        .time-label {
          padding: 20px 8px;
          text-align: center;
          font-size: 12px;
          color: $text-secondary;
          background: $bg-color;
          border-right: 1px solid $border-color;
        }

        .slot-cell {
          padding: 8px;
          min-height: 70px;
          border-right: 1px solid $border-color;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;

          &:last-child {
            border-right: none;
          }

          &.available {
            background: rgba(0, 180, 42, 0.05);

            &:hover {
              background: rgba(0, 180, 42, 0.15);
            }

            .slot-available {
              color: $success-color;
              font-size: 13px;
            }
          }

          &.reserved {
            background: rgba(245, 63, 63, 0.05);
            cursor: not-allowed;

            .slot-info {
              text-align: center;

              .slot-user {
                font-size: 12px;
                font-weight: 500;
                color: $danger-color;
                margin: 0 0 4px 0;
              }

              .slot-purpose {
                font-size: 11px;
                color: $text-secondary;
                margin: 0;
              }
            }
          }

          &.past {
            background: $bg-color;
            cursor: not-allowed;

            .slot-past {
              color: $text-placeholder;
              font-size: 13px;
            }
          }
        }
      }
    }
  }

  .instrument-info {
    .info-row {
      display: flex;
      margin-bottom: 12px;
      font-size: 14px;

      label {
        width: 70px;
        color: $text-secondary;
        margin: 0;
        flex-shrink: 0;
      }

      span {
        color: $text-primary;
        flex: 1;
      }
    }
  }

  .mt20 {
    margin-top: 20px;
  }

  .reservation-notes {
    padding-left: 20px;
    margin: 0;

    li {
      font-size: 13px;
      color: $text-regular;
      margin-bottom: 8px;
      line-height: 1.6;
    }
  }

  .tip {
    margin-left: 10px;
    color: $text-secondary;
    font-size: 13px;
  }
}
</style>
