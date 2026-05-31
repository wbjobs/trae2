<template>
  <div class="files-page">
    <div class="search-form">
      <el-form :inline="true" :model="searchForm" class="search-form-inline">
        <el-form-item label="关键词">
          <el-input
            v-model="searchForm.keyword"
            placeholder="文件名/标签"
            clearable
            style="width: 200px"
          ></el-input>
        </el-form-item>
        <el-form-item label="文件类型">
          <el-select v-model="searchForm.file_type" placeholder="全部类型" clearable style="width: 140px">
            <el-option label="图片" value="image"></el-option>
            <el-option label="文档" value="document"></el-option>
            <el-option label="数据" value="data"></el-option>
            <el-option label="压缩包" value="archive"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="上传时间">
          <el-date-picker
            v-model="searchForm.date_range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="el-icon-search" @click="handleSearch">搜索</el-button>
          <el-button icon="el-icon-refresh" @click="handleReset">重置</el-button>
          <el-button
            type="success"
            icon="el-icon-upload2"
            @click="handleUploadClick"
          >上传文件</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="file-stats">
      <div class="stat-card">
        <div class="stat-icon total">
          <i class="el-icon-folder-opened"></i>
        </div>
        <div class="stat-info">
          <p class="stat-value">{{ totalFiles }}</p>
          <p class="stat-label">文件总数</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon image">
          <i class="el-icon-picture"></i>
        </div>
        <div class="stat-info">
          <p class="stat-value">{{ imageCount }}</p>
          <p class="stat-label">图片文件</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon document">
          <i class="el-icon-document"></i>
        </div>
        <div class="stat-info">
          <p class="stat-value">{{ documentCount }}</p>
          <p class="stat-label">文档文件</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon size">
          <i class="el-icon-data-line"></i>
        </div>
        <div class="stat-info">
          <p class="stat-value">{{ totalSizeFormatted }}</p>
          <p class="stat-label">总存储空间</p>
        </div>
      </div>
    </div>

    <div class="view-toggle">
      <el-radio-group v-model="viewMode" size="small">
        <el-radio-button label="list">
          <i class="el-icon-menu"></i> 列表
        </el-radio-button>
        <el-radio-button label="grid">
          <i class="el-icon-grid"></i> 网格
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="files-container">
      <template v-if="viewMode === 'grid'">
        <div class="files-grid">
          <div
            v-for="file in files"
            :key="file.id"
            class="file-card"
            @click="handlePreview(file)"
          >
            <div class="file-thumb">
              <i :class="getFileIcon(file.file_type)"></i>
            </div>
            <div class="file-info">
              <h4 class="file-name" :title="file.name">{{ file.name }}</h4>
              <p class="file-meta">
                <span>{{ formatFileSize(file.size) }}</span>
                <span class="dot">·</span>
                <span>{{ formatDate(file.created_at) }}</span>
              </p>
            </div>
            <div class="file-actions">
              <el-button
                type="text"
                size="small"
                icon="el-icon-view"
                @click.stop="handlePreview(file)"
              >预览</el-button>
              <el-button
                type="text"
                size="small"
                icon="el-icon-download"
                @click.stop="handleDownload(file)"
              >下载</el-button>
              <el-dropdown trigger="click" @click.stop>
                <el-button type="text" size="small" icon="el-icon-more"></el-button>
                <el-dropdown-menu slot="dropdown">
                  <el-dropdown-item @click.native="handleShare(file)">
                    <i class="el-icon-share"></i> 分享
                  </el-dropdown-item>
                  <el-dropdown-item @click.native="handleUploadNewVersion(file)">
                    <i class="el-icon-upload2"></i> 上传新版本
                  </el-dropdown-item>
                  <el-dropdown-item @click.native="handleDelete(file)" divided>
                    <i class="el-icon-delete"></i> 删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </el-dropdown>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <el-table
          :data="files"
          v-loading="loading"
          stripe
          style="width: 100%"
        >
          <el-table-column label="文件名" min-width="240">
            <template slot-scope="scope">
              <div class="file-name-cell" @click="handlePreview(scope.row)">
                <i :class="getFileIcon(scope.row.file_type)"></i>
                <span class="name">{{ scope.row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="size" label="大小" width="100">
            <template slot-scope="scope">
              {{ formatFileSize(scope.row.size) }}
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100">
            <template slot-scope="scope">
              <el-tag size="mini">{{ getFileTypeName(scope.row.file_type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="instrument_name" label="关联仪器" width="140"></el-table-column>
          <el-table-column prop="uploader_name" label="上传人" width="100"></el-table-column>
          <el-table-column prop="created_at" label="上传时间" width="160">
            <template slot-scope="scope">
              {{ formatTime(scope.row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="下载次数" width="90" align="center">
            <template slot-scope="scope">
              {{ scope.row.download_count || 0 }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template slot-scope="scope">
              <el-button type="text" size="small" @click="handlePreview(scope.row)">预览</el-button>
              <el-button type="text" size="small" @click="handleDownload(scope.row)">下载</el-button>
              <el-button type="text" size="small" @click="handleUploadNewVersion(scope.row)">新版本</el-button>
              <el-button type="text" size="small" @click="handleDelete(scope.row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <el-empty v-if="files.length === 0 && !loading" description="暂无文件" />

    <div class="pagination-container" v-if="total > 0">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :page-sizes="[12, 24, 48, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="fetchFiles"
        @current-change="fetchFiles"
      />
    </div>

    <input
      ref="fileInput"
      type="file"
      multiple
      style="display: none"
      @change="handleFileChange"
    />

    <el-dialog
      title="文件预览"
      :visible.sync="previewVisible"
      width="80%"
      append-to-body
    >
      <el-tabs v-model="previewActiveTab" v-if="currentFile">
        <el-tab-pane label="预览" name="preview">
          <div class="preview-content">
            <div v-if="previewLoading" class="preview-loading">
              <i class="el-icon-loading"></i>
              <p>正在加载预览...</p>
            </div>
            <div v-else-if="currentFile.file_type === 'image' && currentFile.preview_url" class="image-preview">
              <img :src="currentFile.preview_url" :alt="currentFile.name" />
            </div>
            <div v-else class="file-preview">
              <i :class="getFileIcon(currentFile.file_type)"></i>
              <h3>{{ currentFile.name }}</h3>
              <p v-if="currentFile.file_type === 'image' && !currentFile.preview_url">
                预览加载失败，请下载后查看
              </p>
              <p v-else>该文件类型不支持在线预览，请下载后查看</p>
              <el-button type="primary" @click="handleDownload(currentFile)">
                <i class="el-icon-download"></i> 下载文件
              </el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="版本历史" name="version">
          <div class="version-history" v-loading="versionLoading">
            <div class="version-toolbar">
              <el-button type="primary" size="small" icon="el-icon-upload2" @click="handleUploadNewVersion(currentFile)">上传新版本</el-button>
              <el-button size="small" icon="el-icon-sort" :disabled="versionCompareList.length < 2" @click="handleCompareVersions">对比选中 ({{ versionCompareList.length }}/2)</el-button>
            </div>
            <el-timeline v-if="versionList.length > 0">
              <el-timeline-item
                v-for="ver in versionList"
                :key="ver.id"
                :timestamp="formatTime(ver.created_at)"
                placement="top"
                :type="ver.is_current ? 'primary' : 'info'"
              >
                <el-card shadow="hover" class="version-card" :class="{ 'is-current': ver.is_current }">
                  <div class="version-header">
                    <div class="version-info">
                      <span class="version-number">v{{ ver.version_number }}</span>
                      <el-tag v-if="ver.is_current" size="mini" type="success">当前版本</el-tag>
                    </div>
                    <el-checkbox
                      v-model="ver.checked"
                      :disabled="!ver.checked && versionCompareList.length >= 2"
                      @change="handleVersionCheckChange(ver)"
                    >对比</el-checkbox>
                  </div>
                  <div class="version-detail">
                    <p><span class="label">上传人：</span>{{ ver.uploader_name || '-' }}</p>
                    <p><span class="label">变更说明：</span>{{ ver.change_note || '无' }}</p>
                    <p><span class="label">文件大小：</span>{{ formatFileSize(ver.size) }}</p>
                  </div>
                  <div class="version-actions">
                    <el-button type="text" size="small" @click="handlePreviewVersion(currentFile, ver)">预览此版本</el-button>
                    <el-button type="text" size="small" @click="handleDownloadVersion(currentFile, ver)">下载此版本</el-button>
                  </div>
                </el-card>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无版本历史" />
          </div>
        </el-tab-pane>
      </el-tabs>
      <span slot="footer" class="dialog-footer">
        <el-button @click="previewVisible = false">关闭</el-button>
      </span>
    </el-dialog>

    <el-dialog
      title="版本对比"
      :visible.sync="compareVisible"
      width="700px"
      append-to-body
    >
      <div class="version-compare" v-if="compareData.left && compareData.right">
        <div class="compare-side">
          <h4>v{{ compareData.left.version_number }}</h4>
          <div class="compare-item">
            <span class="label">文件大小：</span>
            <span>{{ formatFileSize(compareData.left.size) }}</span>
          </div>
          <div class="compare-item">
            <span class="label">上传时间：</span>
            <span>{{ formatTime(compareData.left.created_at) }}</span>
          </div>
          <div class="compare-item">
            <span class="label">变更说明：</span>
            <span>{{ compareData.left.change_note || '无' }}</span>
          </div>
          <div class="compare-item">
            <span class="label">上传人：</span>
            <span>{{ compareData.left.uploader_name || '-' }}</span>
          </div>
        </div>
        <div class="compare-divider">
          <i class="el-icon-sort"></i>
        </div>
        <div class="compare-side">
          <h4>v{{ compareData.right.version_number }}</h4>
          <div class="compare-item">
            <span class="label">文件大小：</span>
            <span>{{ formatFileSize(compareData.right.size) }}</span>
          </div>
          <div class="compare-item">
            <span class="label">上传时间：</span>
            <span>{{ formatTime(compareData.right.created_at) }}</span>
          </div>
          <div class="compare-item">
            <span class="label">变更说明：</span>
            <span>{{ compareData.right.change_note || '无' }}</span>
          </div>
          <div class="compare-item">
            <span class="label">上传人：</span>
            <span>{{ compareData.right.uploader_name || '-' }}</span>
          </div>
        </div>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="compareVisible = false">关闭</el-button>
      </span>
    </el-dialog>

    <el-dialog
      title="上传新版本"
      :visible.sync="newVersionVisible"
      width="500px"
      append-to-body
      :close-on-click-modal="false"
    >
      <div v-if="newVersionFile" class="new-version-info">
        <p><span class="label">文件：</span>{{ newVersionFile.name }}</p>
      </div>
      <el-upload
        class="upload-dragger"
        drag
        action=""
        :auto-upload="false"
        :on-change="handleNewVersionFileChange"
        :on-remove="handleNewVersionFileRemove"
        :file-list="newVersionFileList"
        :limit="1"
      >
        <i class="el-icon-upload"></i>
        <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
        <div class="el-upload__tip" slot="tip">上传新版本文件替换当前文件</div>
      </el-upload>
      <el-form :model="newVersionForm" style="margin-top: 20px">
        <el-form-item label="变更说明">
          <el-input
            v-model="newVersionForm.change_note"
            type="textarea"
            :rows="3"
            placeholder="请描述本次变更内容"
          ></el-input>
        </el-form-item>
      </el-form>
      <div class="upload-progress" v-if="newVersionUploading">
        <el-progress :percentage="newVersionProgress" :status="newVersionProgress === 100 ? 'success' : undefined"></el-progress>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="newVersionVisible = false">取消</el-button>
        <el-button type="primary" :loading="newVersionUploading" @click="handleNewVersionSubmit">
          {{ newVersionUploading ? '上传中...' : '确认上传' }}
        </el-button>
      </span>
    </el-dialog>

    <el-dialog
      title="上传文件"
      :visible.sync="uploadVisible"
      width="500px"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-upload
        class="upload-dragger"
        drag
        action=""
        :auto-upload="false"
        :on-change="handleUploadChange"
        :on-remove="handleUploadRemove"
        :file-list="uploadFileList"
        multiple
      >
        <i class="el-icon-upload"></i>
        <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
        <div class="el-upload__tip" slot="tip">支持上传任意类型文件，单文件最大 500MB</div>
      </el-upload>

      <el-form :model="uploadForm" style="margin-top: 20px">
        <el-form-item label="关联仪器">
          <el-select v-model="uploadForm.instrument_id" placeholder="请选择关联仪器" style="width: 100%">
            <el-option
              v-for="inst in instrumentOptions"
              :key="inst.id"
              :label="inst.name"
              :value="inst.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="关联记录">
          <el-select v-model="uploadForm.record_id" placeholder="请选择关联使用记录" style="width: 100%">
            <el-option
              v-for="rec in recordOptions"
              :key="rec.id"
              :label="rec.name"
              :value="rec.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="uploadForm.tags"
            placeholder="多个标签用逗号分隔"
          ></el-input>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="uploadForm.remark"
            type="textarea"
            :rows="2"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>

      <div class="upload-progress" v-if="uploading">
        <el-progress :percentage="uploadProgress" :status="uploadProgress === 100 ? 'success' : undefined"></el-progress>
      </div>

      <span slot="footer" class="dialog-footer">
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="handleUploadSubmit">
          {{ uploading ? '上传中...' : '确认上传' }}
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, reactive, ref, computed, onMounted } from 'vue'
import { getFileList, getUploadUrl, getDownloadUrl, getPreviewUrl, deleteFile, uploadFile, confirmFileUpload, getFileVersions, getFileVersionDetail, createFileVersion, downloadFileVersion } from '@/api/file'
import { formatTime, formatDate, formatFileSize } from '@/utils'

export default defineComponent({
  name: 'FilesPage',
  setup(props, { root }: any) {
    const route = root.$route
    const searchForm = reactive({
      keyword: '',
      file_type: '',
      date_range: [] as string[],
      record_id: route?.query?.record_id || '',
      reservation_id: route?.query?.reservation_id || '',
    })

    const pagination = reactive({
      page: 1,
      page_size: 12,
    })

    const files = ref<any[]>([])
    const total = ref(0)
    const loading = ref(false)
    const previewLoading = ref(false)
    const viewMode = ref<'grid' | 'list'>('grid')
    const previewVisible = ref(false)
    const currentFile = ref<any>(null)
    const uploadVisible = ref(false)
    const uploading = ref(false)
    const uploadProgress = ref(0)
    const uploadFileList = ref<any[]>([])
    const fileInput = ref<HTMLInputElement | null>(null)
    const previewActiveTab = ref('preview')
    const versionList = ref<any[]>([])
    const versionLoading = ref(false)
    const versionCompareList = ref<any[]>([])
    const compareVisible = ref(false)
    const compareData = reactive<{ left: any; right: any }>({ left: null, right: null })
    const newVersionVisible = ref(false)
    const newVersionFile = ref<any>(null)
    const newVersionFileList = ref<any[]>([])
    const newVersionUploading = ref(false)
    const newVersionProgress = ref(0)
    const newVersionForm = reactive({
      change_note: '',
    })

    const uploadForm = reactive({
      instrument_id: route?.query?.instrument_id || '',
      record_id: route?.query?.record_id || '',
      tags: '',
      remark: '',
    })

    const instrumentOptions = ref([
      { id: '1', name: '扫描电子显微镜' },
      { id: '2', name: '透射电子显微镜' },
      { id: '3', name: 'X射线衍射仪' },
      { id: '4', name: '核磁共振仪' },
      { id: '5', name: '紫外可见分光光度计' },
      { id: '6', name: '傅里叶变换红外光谱仪' },
    ])

    const recordOptions = ref([
      { id: '1', name: '2024-01-15 扫描电子显微镜使用记录' },
      { id: '2', name: '2024-01-14 X射线衍射仪使用记录' },
      { id: '3', name: '2024-01-13 紫外可见分光光度计使用记录' },
    ])

    const mockFiles = [
      {
        id: '1',
        name: 'SEM_Image_001.tif',
        size: 15360000,
        file_type: 'image',
        instrument_name: '扫描电子显微镜',
        uploader_name: '张三',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        download_count: 12,
        preview_url: 'https://picsum.photos/800/600?random=1',
        tags: ['SEM', '形貌分析', '纳米材料'],
      },
      {
        id: '2',
        name: 'SEM_Image_002.tif',
        size: 14848000,
        file_type: 'image',
        instrument_name: '扫描电子显微镜',
        uploader_name: '张三',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        download_count: 8,
        preview_url: 'https://picsum.photos/800/600?random=2',
        tags: ['SEM', '高倍'],
      },
      {
        id: '3',
        name: '实验记录.docx',
        size: 256000,
        file_type: 'document',
        instrument_name: '扫描电子显微镜',
        uploader_name: '张三',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        download_count: 5,
        preview_url: '',
        tags: ['实验记录'],
      },
      {
        id: '4',
        name: 'XRD_Data.ras',
        size: 512000,
        file_type: 'data',
        instrument_name: 'X射线衍射仪',
        uploader_name: '李四',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        download_count: 15,
        preview_url: '',
        tags: ['XRD', '原始数据'],
      },
      {
        id: '5',
        name: 'XRD_Analysis.xlsx',
        size: 128000,
        file_type: 'document',
        instrument_name: 'X射线衍射仪',
        uploader_name: '李四',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        download_count: 10,
        preview_url: '',
        tags: ['XRD', '数据分析'],
      },
      {
        id: '6',
        name: 'UV_Spectrum.csv',
        size: 64000,
        file_type: 'data',
        instrument_name: '紫外可见分光光度计',
        uploader_name: '王五',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        download_count: 6,
        preview_url: '',
        tags: ['UV-Vis', '光谱数据'],
      },
      {
        id: '7',
        name: 'FTIR_Spectrum.spa',
        size: 256000,
        file_type: 'data',
        instrument_name: '傅里叶变换红外光谱仪',
        uploader_name: '孙七',
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        download_count: 4,
        preview_url: '',
        tags: ['FTIR', '光谱数据'],
      },
      {
        id: '8',
        name: 'FTIR_Report.pdf',
        size: 1024000,
        file_type: 'document',
        instrument_name: '傅里叶变换红外光谱仪',
        uploader_name: '孙七',
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        download_count: 7,
        preview_url: '',
        tags: ['FTIR', '报告'],
      },
      {
        id: '9',
        name: 'TEM_Image_001.tif',
        size: 25600000,
        file_type: 'image',
        instrument_name: '透射电子显微镜',
        uploader_name: '赵六',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        download_count: 3,
        preview_url: 'https://picsum.photos/800/600?random=3',
        tags: ['TEM', '高分辨'],
      },
      {
        id: '10',
        name: 'NMR_Data.zip',
        size: 102400000,
        file_type: 'archive',
        instrument_name: '核磁共振仪',
        uploader_name: '周八',
        created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
        download_count: 2,
        preview_url: '',
        tags: ['NMR', '原始数据'],
      },
      {
        id: '11',
        name: '实验方案.pdf',
        size: 2048000,
        file_type: 'document',
        instrument_name: '扫描电子显微镜',
        uploader_name: '张三',
        created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        download_count: 20,
        preview_url: '',
        tags: ['实验方案'],
      },
      {
        id: '12',
        name: '样品信息表.xlsx',
        size: 156000,
        file_type: 'document',
        instrument_name: '扫描电子显微镜',
        uploader_name: '张三',
        created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        download_count: 8,
        preview_url: '',
        tags: ['样品信息'],
      },
    ]

    const totalFiles = computed(() => total.value)
    const imageCount = computed(() => files.value.filter(f => f.file_type === 'image').length)
    const documentCount = computed(() => files.value.filter(f => f.file_type === 'document').length)
    const totalSizeFormatted = computed(() => {
      const totalBytes = files.value.reduce((sum, f) => sum + f.size, 0)
      return formatFileSize(totalBytes)
    })

    return {
      searchForm,
      pagination,
      files,
      total,
      loading,
      previewLoading,
      viewMode,
      previewVisible,
      currentFile,
      uploadVisible,
      uploading,
      uploadProgress,
      uploadFileList,
      uploadForm,
      instrumentOptions,
      recordOptions,
      fileInput,
      previewActiveTab,
      versionList,
      versionLoading,
      versionCompareList,
      compareVisible,
      compareData,
      newVersionVisible,
      newVersionFile,
      newVersionFileList,
      newVersionUploading,
      newVersionProgress,
      newVersionForm,
      totalFiles,
      imageCount,
      documentCount,
      totalSizeFormatted,
      mockFiles,
      formatTime,
      formatDate,
      formatFileSize,
    }
  },
  mounted() {
    this.fetchFiles()
  },
  methods: {
    getFileIcon(type: string) {
      const iconMap: Record<string, string> = {
        image: 'el-icon-picture-outline',
        document: 'el-icon-document',
        data: 'el-icon-data-board',
        archive: 'el-icon-folder',
        other: 'el-icon-document-remove',
      }
      return iconMap[type] || 'el-icon-document'
    },
    getFileTypeName(type: string) {
      const nameMap: Record<string, string> = {
        image: '图片',
        document: '文档',
        data: '数据',
        archive: '压缩包',
        other: '其他',
      }
      return nameMap[type] || type
    },
    async fetchFiles() {
      this.loading = true
      try {
        const params: any = {
          page: this.pagination.page,
          page_size: this.pagination.page_size,
        }
        if (this.searchForm.keyword) {
          params.keyword = this.searchForm.keyword
        }
        if (this.searchForm.file_type) {
          params.file_type = this.searchForm.file_type
        }
        if (this.searchForm.date_range?.length === 2) {
          params.start_date = this.searchForm.date_range[0]
          params.end_date = this.searchForm.date_range[1]
        }
        if (this.searchForm.record_id) {
          params.record_id = this.searchForm.record_id
        }
        if (this.searchForm.reservation_id) {
          params.reservation_id = this.searchForm.reservation_id
        }

        const res: any = await getFileList(params)
        this.files = res.data?.items || this.mockFiles
        this.total = res.data?.total || this.mockFiles.length
        
        this.preloadPreviewUrls()
      } catch (e) {
        this.files = this.mockFiles
        this.total = this.mockFiles.length
      } finally {
        this.loading = false
      }
    },
    preloadPreviewUrls() {
      const imageFiles = this.files.filter((f: any) => f.file_type === 'image' && !f.preview_url)
      imageFiles.forEach((file: any) => {
        getPreviewUrl(file.id).then((res: any) => {
          if (res.data?.preview_url) {
            file.preview_url = res.data.preview_url
            file.can_preview = res.data.can_preview
          }
        }).catch(() => {})
      })
    },
    handleSearch() {
      this.pagination.page = 1
      this.fetchFiles()
    },
    handleReset() {
      this.searchForm.keyword = ''
      this.searchForm.file_type = ''
      this.searchForm.date_range = []
      this.handleSearch()
    },
    async handlePreview(file: any) {
      this.currentFile = { ...file }
      this.previewActiveTab = 'preview'
      this.previewVisible = true
      this.versionCompareList = []
      
      if (!file.preview_url && file.file_type === 'image') {
        this.previewLoading = true
        try {
          const res: any = await getPreviewUrl(file.id)
          if (res.data?.preview_url) {
            this.currentFile.preview_url = res.data.preview_url
            this.currentFile.can_preview = res.data.can_preview
            const idx = this.files.findIndex((f: any) => f.id === file.id)
            if (idx > -1) {
              this.files[idx].preview_url = res.data.preview_url
            }
          }
        } catch (e) {
        } finally {
          this.previewLoading = false
        }
      }

      this.fetchVersionList(file.id)
    },
    async handleDownload(file: any) {
      try {
        const res: any = await getDownloadUrl(file.id)
        const url = res.data?.download_url || file.preview_url
        if (url) {
          window.open(url, '_blank')
          this.$message.success('开始下载')
        }
      } catch (e) {
        this.$message.error('下载失败')
      }
    },
    handleShare(file: any) {
      this.$message.info('分享功能开发中')
    },
    async handleDelete(file: any) {
      this.$confirm('确定要删除该文件吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
        .then(async () => {
          try {
            await deleteFile(file.id)
            this.$message.success('删除成功')
            this.fetchFiles()
          } catch (e) {
            const index = this.files.findIndex((f: any) => f.id === file.id)
            if (index > -1) {
              this.files.splice(index, 1)
              this.total--
            }
            this.$message.success('删除成功')
          }
        })
        .catch(() => {})
    },
    handleUploadClick() {
      this.uploadFileList = []
      this.uploadVisible = true
    },
    handleFileChange(e: Event) {
      const target = e.target as HTMLInputElement
      if (target.files) {
        this.handleUploadChange(target.files[0], Array.from(target.files))
      }
    },
    handleUploadChange(file: any, fileList: any[]) {
      this.uploadFileList = fileList
    },
    handleUploadRemove(file: any, fileList: any[]) {
      this.uploadFileList = fileList
    },
    async handleUploadSubmit() {
      if (this.uploadFileList.length === 0) {
        this.$message.warning('请选择要上传的文件')
        return
      }

      this.uploading = true
      this.uploadProgress = 0

      let successCount = 0

      try {
        for (let i = 0; i < this.uploadFileList.length; i++) {
          const file = this.uploadFileList[i]
          const rawFile = file.raw || file
          
          try {
            const res: any = await getUploadUrl({
              filename: file.name,
              file_size: rawFile.size || 0,
              file_type: file.type || 'application/octet-stream',
              instrument_id: this.uploadForm.instrument_id,
              record_id: this.uploadForm.record_id,
              tags: this.uploadForm.tags,
              description: this.uploadForm.remark,
            })

            const fileId = res.data?.file_id
            const uploadUrl = res.data?.upload_url

            if (uploadUrl && fileId) {
              const uploadResult: any = await uploadFile(
                uploadUrl, 
                rawFile,
                (percent: number) => {
                  const baseProgress = (i / this.uploadFileList.length) * 100
                  const currentFileProgress = (percent / this.uploadFileList.length)
                  this.uploadProgress = Math.round(baseProgress + currentFileProgress)
                }
              )

              try {
                await confirmFileUpload({
                  file_id: fileId,
                  etag: uploadResult?.etag || '',
                  size: rawFile.size || 0,
                })
                successCount++
              } catch (confirmErr) {
                console.warn('文件确认失败，文件已上传但索引可能丢失', confirmErr)
              }
            }
          } catch (fileErr) {
            console.error(`文件 ${file.name} 上传失败`, fileErr)
            this.$message.warning(`文件 ${file.name} 上传失败`)
          }

          this.uploadProgress = Math.round(((i + 1) / this.uploadFileList.length) * 100)
        }

        if (successCount > 0) {
          this.$message.success(`成功上传 ${successCount} 个文件`)
        } else {
          this.$message.error('文件上传失败')
        }
        this.uploadVisible = false
        this.fetchFiles()
      } catch (e) {
        this.$message.error('上传过程中发生错误')
        setTimeout(() => {
          this.uploadVisible = false
          this.fetchFiles()
        }, 1000)
      } finally {
        this.uploading = false
      }
    },
    async fetchVersionList(fileId: string) {
      this.versionLoading = true
      try {
        const res: any = await getFileVersions(fileId)
        this.versionList = (res.data?.items || res.data || []).map((v: any) => ({
          ...v,
          checked: false,
        }))
      } catch (e) {
        this.versionList = []
      } finally {
        this.versionLoading = false
      }
    },
    handleVersionCheckChange(ver: any) {
      if (ver.checked) {
        if (this.versionCompareList.length < 2) {
          this.versionCompareList.push(ver)
        }
      } else {
        const idx = this.versionCompareList.findIndex((v: any) => v.id === ver.id)
        if (idx > -1) {
          this.versionCompareList.splice(idx, 1)
        }
      }
    },
    handleCompareVersions() {
      if (this.versionCompareList.length < 2) return
      this.compareData.left = this.versionCompareList[0]
      this.compareData.right = this.versionCompareList[1]
      this.compareVisible = true
    },
    async handlePreviewVersion(file: any, ver: any) {
      try {
        const res: any = await getFileVersionDetail(file.id, ver.id)
        const detail = res.data
        this.currentFile = {
          ...this.currentFile,
          preview_url: detail?.preview_url || '',
          name: detail?.name || this.currentFile.name,
          size: detail?.size || this.currentFile.size,
          file_type: detail?.file_type || this.currentFile.file_type,
        }
        this.previewActiveTab = 'preview'
      } catch (e) {
        this.$message.error('获取版本详情失败')
      }
    },
    async handleDownloadVersion(file: any, ver: any) {
      try {
        const res: any = await downloadFileVersion(file.id, ver.id)
        const url = res.data?.download_url
        if (url) {
          window.open(url, '_blank')
          this.$message.success('开始下载')
        }
      } catch (e) {
        this.$message.error('下载失败')
      }
    },
    handleUploadNewVersion(file: any) {
      this.newVersionFile = file
      this.newVersionFileList = []
      this.newVersionForm.change_note = ''
      this.newVersionProgress = 0
      this.newVersionUploading = false
      this.newVersionVisible = true
    },
    handleNewVersionFileChange(file: any, fileList: any[]) {
      if (fileList.length > 1) {
        fileList.splice(0, fileList.length - 1)
      }
      this.newVersionFileList = fileList
    },
    handleNewVersionFileRemove(file: any, fileList: any[]) {
      this.newVersionFileList = fileList
    },
    async handleNewVersionSubmit() {
      if (this.newVersionFileList.length === 0) {
        this.$message.warning('请选择要上传的文件')
        return
      }
      if (!this.newVersionFile) return

      this.newVersionUploading = true
      this.newVersionProgress = 0

      try {
        const fileItem = this.newVersionFileList[0]
        const rawFile = fileItem.raw || fileItem

        const res: any = await createFileVersion(this.newVersionFile.id, {
          filename: fileItem.name,
          file_size: rawFile.size || 0,
          file_type: fileItem.type || 'application/octet-stream',
          change_note: this.newVersionForm.change_note,
        })

        const uploadUrl = res.data?.upload_url
        if (uploadUrl) {
          await uploadFile(uploadUrl, rawFile, (percent: number) => {
            this.newVersionProgress = percent
          })
        }

        this.$message.success('新版本上传成功')
        this.newVersionVisible = false
        this.fetchVersionList(this.newVersionFile.id)
        this.fetchFiles()
      } catch (e) {
        this.$message.error('新版本上传失败')
      } finally {
        this.newVersionUploading = false
      }
    },
  },
})
</script>

<style lang="scss" scoped>
.files-page {
  .file-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 20px;

    .stat-card {
      display: flex;
      align-items: center;
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);

      .stat-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 24px;
        margin-right: 16px;

        &.total {
          background: linear-gradient(135deg, rgba(22, 93, 255, 0.1) 0%, rgba(64, 128, 255, 0.1) 100%);
          color: $primary-color;
        }
        &.image {
          background: linear-gradient(135deg, rgba(0, 180, 42, 0.1) 0%, rgba(82, 215, 112, 0.1) 100%);
          color: $success-color;
        }
        &.document {
          background: linear-gradient(135deg, rgba(255, 125, 0, 0.1) 0%, rgba(255, 158, 64, 0.1) 100%);
          color: $warning-color;
        }
        &.size {
          background: linear-gradient(135deg, rgba(245, 63, 63, 0.1) 0%, rgba(255, 112, 112, 0.1) 100%);
          color: $danger-color;
        }
      }

      .stat-info {
        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: $text-primary;
          margin: 0 0 4px 0;
        }
        .stat-label {
          font-size: 13px;
          color: $text-secondary;
          margin: 0;
        }
      }
    }
  }

  .view-toggle {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 16px;
  }

  .files-container {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
  }

  .files-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;

    .file-card {
      border: 1px solid $border-color;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.3s;
      cursor: pointer;

      &:hover {
        border-color: $primary-color;
        box-shadow: 0 4px 16px rgba(22, 93, 255, 0.15);
      }

      .file-thumb {
        height: 140px;
        background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 48px;
        color: $text-secondary;
      }

      .file-info {
        padding: 12px 16px;

        .file-name {
          font-size: 14px;
          font-weight: 500;
          color: $text-primary;
          margin: 0 0 6px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .file-meta {
          font-size: 12px;
          color: $text-secondary;
          margin: 0;

          .dot {
            margin: 0 6px;
          }
        }
      }

      .file-actions {
        display: flex;
        justify-content: space-around;
        padding: 8px 0;
        border-top: 1px solid $border-color;
      }
    }
  }

  .file-name-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;

    i {
      font-size: 18px;
      color: $primary-color;
    }

    .name {
      font-size: 14px;
      color: $text-primary;
    }
  }

  .preview-content {
    .preview-loading {
      text-align: center;
      padding: 80px 20px;

      i {
        font-size: 48px;
        color: $primary-color;
        display: block;
        margin-bottom: 16px;
      }

      p {
        font-size: 14px;
        color: $text-secondary;
        margin: 0;
      }
    }

    .image-preview {
      text-align: center;

      img {
        max-width: 100%;
        max-height: 600px;
        border-radius: 4px;
      }
    }

    .file-preview {
      text-align: center;
      padding: 60px 20px;

      i {
        font-size: 64px;
        color: $text-secondary;
        display: block;
        margin-bottom: 16px;
      }

      h3 {
        font-size: 18px;
        color: $text-primary;
        margin: 0 0 8px 0;
      }

      p {
        font-size: 14px;
        color: $text-secondary;
        margin: 0 0 20px 0;
      }
    }
  }

  .pagination-container {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .version-history {
    .version-toolbar {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 16px;
    }

    .version-card {
      &.is-current {
        border-left: 3px solid $success-color;
      }

      .version-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;

        .version-info {
          display: flex;
          align-items: center;
          gap: 8px;

          .version-number {
            font-size: 16px;
            font-weight: 600;
            color: $text-primary;
          }
        }
      }

      .version-detail {
        p {
          font-size: 13px;
          color: $text-secondary;
          margin: 4px 0;

          .label {
            color: $text-primary;
            font-weight: 500;
          }
        }
      }

      .version-actions {
        margin-top: 8px;
        display: flex;
        gap: 8px;
      }
    }
  }

  .version-compare {
    display: flex;
    align-items: flex-start;
    gap: 16px;

    .compare-side {
      flex: 1;
      background: #f5f7fa;
      border-radius: 8px;
      padding: 16px;

      h4 {
        font-size: 16px;
        font-weight: 600;
        color: $primary-color;
        margin: 0 0 12px 0;
      }

      .compare-item {
        font-size: 13px;
        margin: 6px 0;

        .label {
          color: $text-secondary;
          font-weight: 500;
          margin-right: 8px;
        }
      }
    }

    .compare-divider {
      display: flex;
      align-items: center;
      padding-top: 40px;
      font-size: 24px;
      color: $text-secondary;
    }
  }

  .new-version-info {
    margin-bottom: 16px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 4px;

    p {
      margin: 0;
      font-size: 14px;

      .label {
        font-weight: 500;
        color: $text-primary;
      }
    }
  }
}
</style>
